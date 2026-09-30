import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { AppError } from "../../errors/AppError";
import { feedbackParaDTO } from "../../utils/dto";
import { feedbacksService } from "./feedbacks.service";
import { exclusaoPelaEquipeSchema, feedbackSchema } from "./feedbacks.schemas";

export const feedbacksRouter = Router();

// admin/secretaria veem tudo, aluno so o proprio
function ehEquipe(perfil: string) {
  return perfil === "ADMINISTRADOR" || perfil === "SECRETARIA";
}

// lista feedbacks, filtrado por evento/participante (aluno so ve o dele)
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

// eventos que o aluno logado pode avaliar agora (certificado recebido + ainda sem feedback);
// tem que vir antes de "/:id", senao "elegiveis" seria lido como um id
feedbacksRouter.get(
  "/elegiveis",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    res.json(await feedbacksService.listarEventosElegiveis(participanteId));
  }),
);

// busca um feedback pelo id, bloqueia se nao for da equipe nem dono
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

// so o ALUNO envia feedback, sempre em nome dele mesmo (participanteId do token, nunca do corpo)
// e so de palestra em que recebeu o certificado. A equipe nao escreve feedback em nome de aluno
feedbacksRouter.post(
  "/",
  autenticar,
  autorizar("ALUNO"),
  validarCorpo(feedbackSchema),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    // 403 se nao tem certificado nesse evento; se ja avaliou, o criar() abaixo responde 409
    await feedbacksService.validarDireitoAoCertificado(req.body.eventoId, participanteId);

    const feedback = await feedbacksService.criar(
      req.body.eventoId,
      participanteId,
      req.body.nota,
      req.body.comentario,
      req.usuario!.sub,
    );
    res.status(201).json(feedbackParaDTO(feedback));
  }),
);

// feedback nao e editado por ninguem depois de enviado: o aluno corrige excluindo e enviando outro;
// a equipe nao altera o conteudo do que o aluno escreveu, so pode excluir (com motivo)
feedbacksRouter.put(
  "/:id",
  autenticar,
  asyncHandler(async (req) => {
    throw AppError.acessoNegado(
      ehEquipe(req.usuario!.perfil)
        ? "A equipe não edita feedback de aluno — só pode excluí-lo, informando o motivo."
        : "O feedback não pode ser editado depois de enviado. Exclua e envie um novo.",
    );
  }),
);

// aluno exclui o proprio (sem motivo); equipe exclui qualquer um, com motivo obrigatorio
feedbacksRouter.delete(
  "/:id",
  autenticar,
  asyncHandler(async (req, res, next) => {
    if (ehEquipe(req.usuario!.perfil)) return next();
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    await feedbacksService.excluirPeloAluno(req.params.id, participanteId, req.usuario!.sub);
    res.status(204).send();
  }),
  validarCorpo(exclusaoPelaEquipeSchema),
  asyncHandler(async (req, res) => {
    await feedbacksService.excluirPelaEquipe(req.params.id, req.body.motivo, req.usuario!.sub);
    res.status(204).send();
  }),
);
