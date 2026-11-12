import { Router, type Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../errors/AppError";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import type { Ator } from "../../utils/escopo";
import { professoresService } from "./professores.service";
import { contaEquipeSchema, filtroEquipeSchema, inativacaoProfessorSchema } from "./professores.schemas";

// tela Equipe (antes "Professores"): administrador e secretaria criam e acompanham as contas de professor; so o
// administrador as de secretaria. Montado em /api/equipe e, pra nao quebrar quem ja usa, em /api/professores
export const professoresRouter = Router();

professoresRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

function atorDe(req: Request): Ator {
  return { id: req.usuario!.sub, perfil: req.usuario!.perfil };
}

// professores e secretarias (nunca administradores): nome, e-mail, perfil, situacao e se quem pede pode gerenciar
professoresRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filtro = filtroEquipeSchema.safeParse(req.query);
    if (!filtro.success) throw AppError.validacao("Filtro inválido.", [{ campo: "perfil", mensagem: "Perfil inválido." }]);
    res.json(await professoresService.listar(atorDe(req), filtro.data.perfil));
  }),
);

// cria a conta (nome, e-mail @umc.br e perfil) e envia o convite do primeiro acesso
professoresRouter.post(
  "/",
  validarCorpo(contaEquipeSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await professoresService.criar(req.body, atorDe(req)));
  }),
);

// novo convite (link por e-mail), enquanto a conta nao fez o primeiro acesso; o anterior deixa de valer
professoresRouter.post(
  "/:id/reenviar-convite",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.reenviarConvite(req.params.id, atorDe(req)));
  }),
);

// eventos em aberto do professor (nao encerrados ou encerrados ha menos de 24 h): precisam de novo responsavel
// antes da inativacao. Secretaria: lista vazia
professoresRouter.get(
  "/:id/eventos-em-aberto",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.listarEventosEmAberto(req.params.id, atorDe(req)));
  }),
);

// inativa (motivo obrigatorio), transferindo os eventos em aberto do professor para outro professor ativo ou para a equipe
professoresRouter.post(
  "/:id/inativar",
  validarCorpo(inativacaoProfessorSchema),
  asyncHandler(async (req, res) => {
    res.json(await professoresService.inativar(req.params.id, req.body, atorDe(req)));
  }),
);

// reativa a conta
professoresRouter.post(
  "/:id/reativar",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.reativar(req.params.id, atorDe(req)));
  }),
);

// exclui conta inativa ou com convite pendente; com historico, so fica inativa (resposta diz qual dos dois)
professoresRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.excluir(req.params.id, atorDe(req)));
  }),
);
