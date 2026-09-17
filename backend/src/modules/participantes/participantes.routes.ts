import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { participanteParaDTO } from "../../utils/dto";
import { participantesService } from "./participantes.service";

export const participantesRouter = Router();

// nenhum verbo liberado pro ALUNO aqui, nem leitura
participantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

// lista todos os participantes
participantesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const participantes = await participantesService.listar();
    res.json(participantes.map(participanteParaDTO));
  }),
);

// busca um participante pelo id
participantesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const participante = await participantesService.buscarOuFalhar(req.params.id);
    res.json(participanteParaDTO(participante));
  }),
);
