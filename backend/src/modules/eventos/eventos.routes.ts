import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { eventoParaDTO, inscricaoParaDTO, tentativaParaDTO } from "../../utils/dto";
import { AppError } from "../../errors/AppError";
import { questionarioService } from "../questionario/questionario.service";
import { respostasQuestionarioSchema } from "../questionario/questionario.schemas";
import { eventosService } from "./eventos.service";
import { eventoSchema, eventoUpdateSchema } from "./eventos.schemas";

export const eventosRouter = Router();

eventosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const eventos = await eventosService.listar();
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventos.map((e) => eventoParaDTO(e, paraAluno)));
  }),
);

eventosRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.id);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventoParaDTO(evento, paraAluno));
  }),
);

eventosRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.criar(req.body);
    res.status(201).json(eventoParaDTO(evento, false));
  }),
);

eventosRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoUpdateSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.atualizar(req.params.id, req.body);
    res.json(eventoParaDTO(evento, false));
  }),
);

eventosRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await eventosService.remover(req.params.id);
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
    const inscricao = await eventosService.autoinscrever(req.params.eventoId, participanteId);
    res.status(201).json(inscricaoParaDTO(inscricao));
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
    const tentativa = await questionarioService.responder(req.params.eventoId, participanteId, req.body);
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
