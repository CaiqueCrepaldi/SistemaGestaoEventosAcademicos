import { Router, type Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { palestranteParaDTO } from "../../utils/dto";
import { ehEquipe } from "../../utils/escopo";
import type { Palestrante } from "../../types/domain";
import { recusaSchema, reenvioSchema } from "../aprovacoes/aprovacoes.schemas";
import { palestrantesService } from "./palestrantes.service";
import { palestranteSchema, palestranteUpdateSchema } from "./palestrantes.schemas";

export const palestrantesRouter = Router();

function atorDe(req: Request) {
  return { id: req.usuario!.sub, perfil: req.usuario!.perfil };
}

// e-mail, situacao e motivo da recusa: so pra equipe e pro professor que criou o palestrante. Aluno e
// outros professores recebem id e nome (minimizacao, guia 4.3)
function paraResposta(req: Request, palestrante: Palestrante) {
  const completo = ehEquipe(req.usuario!.perfil) || (req.usuario!.perfil === "PROFESSOR" && palestrante.criadoPorId === req.usuario!.sub);
  return palestranteParaDTO(palestrante, completo);
}

const SITUACOES = ["PENDENTE", "APROVADO", "RECUSADO"] as const;

// leitura liberada pra qualquer perfil, filtrada por utils/escopo.ts: o aluno so ve palestrante aprovado;
// o professor, os aprovados e os dele. ?situacao=PENDENTE filtra (ex.: "Aguardando aprovacao")
palestrantesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const situacao = SITUACOES.find((s) => s === req.query.situacao);
    const palestrantes = await palestrantesService.listar(atorDe(req), situacao);
    res.json(palestrantes.map((p) => paraResposta(req, p)));
  }),
);

// busca um palestrante pelo id (404 se o perfil nao pode ve-lo)
palestrantesRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    res.json(paraResposta(req, await palestrantesService.buscarOuFalhar(req.params.id, atorDe(req))));
  }),
);

// historico da aprovacao: equipe e o professor que criou
palestrantesRouter.get(
  "/:id/historico",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    res.json(await palestrantesService.historico(req.params.id, atorDe(req)));
  }),
);

// cadastro: equipe (ja nasce aprovado) ou professor (nasce aguardando aprovacao)
palestrantesRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  validarCorpo(palestranteSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(paraResposta(req, await palestrantesService.criar(req.body, atorDe(req))));
  }),
);

// edicao: equipe qualquer um; professor so os dele, enquanto nao estao aprovados
palestrantesRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  validarCorpo(palestranteUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json(paraResposta(req, await palestrantesService.atualizar(req.params.id, req.body, atorDe(req))));
  }),
);

// o professor reenvia o proprio palestrante recusado (resposta opcional)
palestrantesRouter.post(
  "/:id/reenviar",
  autenticar,
  autorizar("PROFESSOR"),
  validarCorpo(reenvioSchema),
  asyncHandler(async (req, res) => {
    res.json(paraResposta(req, await palestrantesService.reenviar(req.params.id, req.body.resposta, atorDe(req))));
  }),
);

// daqui pra baixo so a equipe: excluir, aprovar e recusar
palestrantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

palestrantesRouter.post(
  "/:id/aprovar",
  asyncHandler(async (req, res) => {
    res.json(paraResposta(req, await palestrantesService.aprovar(req.params.id, atorDe(req))));
  }),
);

palestrantesRouter.post(
  "/:id/recusar",
  validarCorpo(recusaSchema),
  asyncHandler(async (req, res) => {
    res.json(paraResposta(req, await palestrantesService.recusar(req.params.id, req.body.motivo, atorDe(req))));
  }),
);

palestrantesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await palestrantesService.remover(req.params.id, atorDe(req));
    res.status(204).send();
  }),
);
