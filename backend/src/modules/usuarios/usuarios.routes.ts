import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { usuariosStore } from "../../db/store";
import { usuarioParaDTO } from "../../utils/dto";

export const usuariosRouter = Router();

// dados do usuario do token, busca fresco no store pra pegar mudanca recente
usuariosRouter.get(
  "/me",
  autenticar,
  asyncHandler(async (req, res) => {
    const usuario = usuariosStore.buscarPorId(req.usuario!.sub);
    if (!usuario) throw AppError.naoAutenticado();
    res.status(200).json(usuarioParaDTO(usuario));
  }),
);
