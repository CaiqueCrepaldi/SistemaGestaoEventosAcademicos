import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/prisma";
import { usuarioParaDTO } from "../../utils/dto";
import { usuarioParaDominio } from "../auth/auth.service";

export const usuariosRouter = Router();

// dados do usuario do token, busca fresco no banco pra pegar mudanca recente
usuariosRouter.get(
  "/me",
  autenticar,
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.sub } });
    if (!usuario) throw AppError.naoAutenticado();
    res.status(200).json(usuarioParaDTO(usuarioParaDominio(usuario)));
  }),
);
