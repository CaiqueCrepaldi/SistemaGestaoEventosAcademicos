import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { tentativaParaDTO } from "../../utils/dto";
import { questionarioService } from "./questionario.service";

// rota separada de /eventos/:eventoId, usada so pela tela de certificados da
// equipe que precisa da nota de todo mundo em todo evento de uma vez
export const questionarioRouter = Router();

questionarioRouter.get(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (_req, res) => {
    const tentativas = await questionarioService.listarTodas();
    res.json(tentativas.map(tentativaParaDTO));
  }),
);
