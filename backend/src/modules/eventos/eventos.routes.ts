import { Router, type Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { eventoParaDTO, inscricaoParaDTO, tentativaParaDTO } from "../../utils/dto";
import { AppError } from "../../errors/AppError";
import { inscricoesService } from "../inscricoes/inscricoes.service";
import { questionarioService } from "../questionario/questionario.service";
import { respostasQuestionarioSchema } from "../questionario/questionario.schemas";
import { recusaSchema, reenvioSchema } from "../aprovacoes/aprovacoes.schemas";
import { eventosService } from "./eventos.service";
import { eventoSchema, eventoUpdateSchema } from "./eventos.schemas";

export const eventosRouter = Router();

function atorDe(req: Request) {
  return { id: req.usuario!.sub, perfil: req.usuario!.perfil, participanteId: req.usuario!.participanteId };
}

const SITUACOES = ["PENDENTE", "APROVADO", "RECUSADO"] as const;

// lista os eventos que o perfil pode ver (utils/escopo.ts): equipe todos, professor os dele, aluno so os
// aprovados. ?situacao=PENDENTE filtra (ex.: "Aguardando aprovacao"). Questionario redigido pro ALUNO
eventosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const situacao = SITUACOES.find((s) => s === req.query.situacao);
    const eventos = await eventosService.listar(atorDe(req), situacao);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventos.map((e) => eventoParaDTO(e, paraAluno)));
  }),
);

// busca um evento pelo id (404 se o perfil nao pode ve-lo)
eventosRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.id, atorDe(req));
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventoParaDTO(evento, paraAluno));
  }),
);

// cadastra um evento novo: equipe (ja nasce aprovado) ou professor (nasce aguardando aprovacao)
eventosRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  validarCorpo(eventoSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.criar(req.body, atorDe(req));
    res.status(201).json(eventoParaDTO(evento, false));
  }),
);

// edita um evento: equipe qualquer um, professor so os dele. Evento encerrado ninguem edita (409)
eventosRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  validarCorpo(eventoUpdateSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.atualizar(req.params.id, req.body, atorDe(req));
    res.json(eventoParaDTO(evento, false));
  }),
);

// remove um evento (equipe qualquer um, professor so os dele) — 409 se ainda tiver inscricao ou ja tiver
// sido encerrado (nada some em cascata)
eventosRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    await eventosService.remover(req.params.id, atorDe(req));
    res.status(204).send();
  }),
);

// aprovacao: so a equipe aprova (sem motivo) ou recusa (motivo obrigatorio) um evento pendente
eventosRouter.post(
  "/:id/aprovar",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    res.json(eventoParaDTO(await eventosService.aprovar(req.params.id, atorDe(req)), false));
  }),
);
eventosRouter.post(
  "/:id/recusar",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(recusaSchema),
  asyncHandler(async (req, res) => {
    res.json(eventoParaDTO(await eventosService.recusar(req.params.id, req.body.motivo, atorDe(req)), false));
  }),
);
// o professor reenvia o proprio evento recusado, com uma resposta opcional (volta para pendente)
eventosRouter.post(
  "/:id/reenviar",
  autenticar,
  autorizar("PROFESSOR"),
  validarCorpo(reenvioSchema),
  asyncHandler(async (req, res) => {
    res.json(eventoParaDTO(await eventosService.reenviar(req.params.id, req.body.resposta, atorDe(req)), false));
  }),
);
// historico da aprovacao: equipe e o professor dono do evento
eventosRouter.get(
  "/:id/historico",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    res.json(await eventosService.historico(req.params.id, atorDe(req)));
  }),
);

// autoinscricao, so ALUNO, sempre usa o participanteId do proprio token
eventosRouter.post(
  "/:eventoId/inscricoes",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const { inscricao, emailConfirmacaoEnviado } = await eventosService.autoinscrever(
      req.params.eventoId,
      participanteId,
      req.usuario!.sub,
    );
    // o e-mail de confirmacao ja foi enviado pelo backend; o campo extra so diz pra tela se saiu
    res.status(201).json({ ...inscricaoParaDTO(inscricao), emailConfirmacaoEnviado });
  }),
);

// RF025: o aluno cancela a propria inscricao no evento — sempre a do participante do token. A
// regra (presenca pendente, evento ainda nao comecou) e a mesma do cancelamento pela equipe
eventosRouter.delete(
  "/:eventoId/inscricoes",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    await inscricoesService.cancelarPeloAluno(req.params.eventoId, participanteId, req.usuario!.sub);
    res.status(204).send();
  }),
);

// perguntas do questionario sem gabarito, pra tela do aluno
eventosRouter.get(
  "/:eventoId/questionario",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.eventoId, atorDe(req));
    res.json(eventoParaDTO(evento, true).questionario);
  }),
);

// recebe as respostas do aluno, corrige e salva a tentativa
eventosRouter.post(
  "/:eventoId/questionario/respostas",
  autenticar,
  autorizar("ALUNO"),
  validarCorpo(respostasQuestionarioSchema),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const tentativa = await questionarioService.responder(req.params.eventoId, participanteId, req.body, req.usuario!.sub);
    res.status(201).json(tentativaParaDTO(tentativa));
  }),
);

// tentativas do proprio aluno nesse evento, usado pra liberar o certificado
eventosRouter.get(
  "/:eventoId/questionario/tentativas",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const tentativas = await questionarioService.listarTentativas(req.params.eventoId, participanteId);
    res.json(tentativas.map(tentativaParaDTO));
  }),
);
