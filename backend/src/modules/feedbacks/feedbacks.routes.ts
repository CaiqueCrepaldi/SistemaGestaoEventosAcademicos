import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { AppError } from "../../errors/AppError";
import { feedbackParaDTO } from "../../utils/dto";
import { feedbacksService } from "./feedbacks.service";
import { feedbackSchema, feedbackUpdateSchema } from "./feedbacks.schemas";

export const feedbacksRouter = Router();

function ehEquipe(perfil: string) {
  return perfil === "ADMINISTRADOR" || perfil === "SECRETARIA";
}

feedbacksRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const eventoId = typeof req.query.eventoId === "string" ? req.query.eventoId : undefined;
    const participanteIdQuery = typeof req.query.participanteId === "string" ? req.query.participanteId : undefined;

    // aluno nunca ve feedback de outra pessoa mesmo pedindo por query param
    const participanteId = ehEquipe(req.usuario!.perfil) ? participanteIdQuery : req.usuario!.participanteId ?? undefined;

    const feedbacks = await feedbacksService.listar({ eventoId, participanteId });
    res.json(feedbacks.map(feedbackParaDTO));
  }),
);

feedbacksRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const feedback = await feedbacksService.buscarOuFalhar(req.params.id);
    if (!ehEquipe(req.usuario!.perfil) && feedback.participanteId !== req.usuario!.participanteId) {
      throw AppError.acessoNegado();
    }
    res.json(feedbackParaDTO(feedback));
  }),
);

feedbacksRouter.post(
  "/",
  autenticar,
  validarCorpo(feedbackSchema),
  asyncHandler(async (req, res) => {
    // aluno so cria feedback em nome dele mesmo, participanteId do corpo eh ignorado nesse caso
    const participanteId = ehEquipe(req.usuario!.perfil)
      ? req.body.participanteId
      : req.usuario!.participanteId;

    if (!participanteId) {
      throw AppError.validacao("Dados inválidos.", [
        { campo: "participanteId", mensagem: "participanteId é obrigatório." },
      ]);
    }

    const feedback = await feedbacksService.criar(req.body.eventoId, participanteId, req.body.nota, req.body.comentario);
    res.status(201).json(feedbackParaDTO(feedback));
  }),
);

feedbacksRouter.put(
  "/:id",
  autenticar,
  validarCorpo(feedbackUpdateSchema),
  asyncHandler(async (req, res) => {
    const feedback = await feedbacksService.buscarOuFalhar(req.params.id);
    if (!ehEquipe(req.usuario!.perfil) && feedback.participanteId !== req.usuario!.participanteId) {
      throw AppError.acessoNegado();
    }
    const atualizado = await feedbacksService.atualizar(req.params.id, req.body);
    res.json(feedbackParaDTO(atualizado));
  }),
);

feedbacksRouter.delete(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const feedback = await feedbacksService.buscarOuFalhar(req.params.id);
    if (!ehEquipe(req.usuario!.perfil) && feedback.participanteId !== req.usuario!.participanteId) {
      throw AppError.acessoNegado();
    }
    await feedbacksService.remover(req.params.id);
    res.status(204).send();
  }),
);
