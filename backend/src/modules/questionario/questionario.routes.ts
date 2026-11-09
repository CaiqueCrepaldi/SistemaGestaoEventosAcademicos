import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { tentativaParaDTO } from "../../utils/dto";
import { eventosVisiveis } from "../../utils/escopo";
import { questionarioService } from "./questionario.service";

// rota separada de /eventos/:eventoId, usada pelas telas da equipe: Certificados (nota de todo
// mundo em todo evento de uma vez) e Check-in (?participanteId= — so as tentativas de um aluno)
export const questionarioRouter = Router();

questionarioRouter.get(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    const participanteId = typeof req.query.participanteId === "string" ? req.query.participanteId : undefined;
    // o professor so ve as notas dos eventos dele
    const tentativas = await questionarioService.listarTodas(participanteId, eventosVisiveis({ id: req.usuario!.sub, perfil: req.usuario!.perfil }));
    res.json(tentativas.map(tentativaParaDTO));
  }),
);
