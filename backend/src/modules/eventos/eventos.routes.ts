import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { eventoParaDTO, inscricaoParaDTO, tentativaParaDTO } from "../../utils/dto";
import { AppError } from "../../errors/AppError";
import { inscricoesService } from "../inscricoes/inscricoes.service";
import { questionarioService } from "../questionario/questionario.service";
import { respostasQuestionarioSchema } from "../questionario/questionario.schemas";
import { eventosService } from "./eventos.service";
import { eventoSchema, eventoUpdateSchema } from "./eventos.schemas";

export const eventosRouter = Router();

// lista todos os eventos, questionario redigido se for ALUNO
eventosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const eventos = await eventosService.listar();
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventos.map((e) => eventoParaDTO(e, paraAluno)));
  }),
);

// busca um evento pelo id
eventosRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.id);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventoParaDTO(evento, paraAluno));
  }),
);

// cadastra um evento novo, so admin/secretaria
eventosRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.criar(req.body, req.usuario!.sub);
    res.status(201).json(eventoParaDTO(evento, false));
  }),
);

// edita um evento existente, so admin/secretaria
eventosRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoUpdateSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.atualizar(req.params.id, req.body, req.usuario!.sub);
    res.json(eventoParaDTO(evento, false));
  }),
);

// remove um evento, so admin/secretaria — 409 se ainda tiver inscricao (nada some em cascata)
eventosRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await eventosService.remover(req.params.id, req.usuario!.sub);
    res.status(204).send();
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
    const evento = await eventosService.buscarOuFalhar(req.params.eventoId);
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
