import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/prisma";
import { usuarioParaDTO } from "../../utils/dto";
import { usuarioParaDominio } from "../auth/auth.service";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, limparTentativas } from "../../utils/limiteAcesso";

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

// remove o bloqueio por excesso de tentativas (login e recuperacao de senha) de uma conta
// especifica — so ADMINISTRADOR, nao derruba o bloqueio por IP (esse so expira sozinho)
usuariosRouter.delete(
  "/:id/bloqueio",
  autenticar,
  autorizar("ADMINISTRADOR"),
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Usuário não encontrado.");

    await Promise.all([
      limparTentativas(chaveConta("login", usuario.emailLoginHash)),
      limparTentativas(chaveConta("recuperacao", usuario.emailLoginHash)),
    ]);
    await registrarAuditoria(req.usuario!.sub, "BLOQUEIO_LOGIN_REMOVIDO", `usuário ${usuario.id}`);

    res.status(204).send();
  }),
);
