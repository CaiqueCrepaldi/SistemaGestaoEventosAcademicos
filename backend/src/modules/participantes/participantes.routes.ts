import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { participanteParaDTO } from "../../utils/dto";
import { participantesService } from "./participantes.service";
import { participanteSchema, participanteUpdateSchema } from "./participantes.schemas";

export const participantesRouter = Router();

// nenhum verbo liberado pro ALUNO aqui, nem leitura
participantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

participantesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const participantes = await participantesService.listar();
    res.json(participantes.map(participanteParaDTO));
  }),
);

participantesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const participante = await participantesService.buscarOuFalhar(req.params.id);
    res.json(participanteParaDTO(participante));
  }),
);

participantesRouter.post(
  "/",
  validarCorpo(participanteSchema),
  asyncHandler(async (req, res) => {
    const participante = await participantesService.criar(req.body);
    res.status(201).json(participanteParaDTO(participante));
  }),
);

participantesRouter.put(
  "/:id",
  validarCorpo(participanteUpdateSchema),
  asyncHandler(async (req, res) => {
    const participante = await participantesService.atualizar(req.params.id, req.body);
    res.json(participanteParaDTO(participante));
  }),
);

participantesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await participantesService.remover(req.params.id);
    res.status(204).send();
  }),
);
