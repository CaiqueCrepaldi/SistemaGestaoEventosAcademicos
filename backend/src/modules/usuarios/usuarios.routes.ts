import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/prisma";
import { usuarioParaDTO } from "../../utils/dto";
import { COM_RGM, usuarioParaDominio } from "../auth/auth.service";
import { mfaService } from "../mfa/mfa.service";
import { registrarAuditoria } from "../../utils/auditoria";
import { chavesDaConta, limparTentativas } from "../../utils/limiteAcesso";

export const usuariosRouter = Router();

// dados do usuario do token, busca fresco no banco pra pegar mudanca recente
usuariosRouter.get(
  "/me",
  autenticar,
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.sub },
      include: { participante: { select: COM_RGM } },
    });
    if (!usuario) throw AppError.naoAutenticado();
    res.status(200).json(usuarioParaDTO(usuarioParaDominio(usuario)));
  }),
);

// Nao existe mais listagem de contas (a tela Usuarios saiu): a situacao do 2FA e do bloqueio de cada
// aluno aparece na listagem de participantes (GET /participantes). As duas acoes abaixo continuam
// aqui porque agem sobre a CONTA de acesso, e valem pra qualquer perfil — a tela Participantes chama
// com o id da conta do aluno; conta de administrador/secretaria so por esta API ou pelo script
// scripts/resetar-2fa.ts (ver docs/api-contract.md)

// remove o bloqueio por excesso de tentativas (login, recuperacao de senha e codigo do 2FA) de
// uma conta especifica — so ADMINISTRADOR, nao derruba o bloqueio por IP (esse so expira sozinho)
usuariosRouter.delete(
  "/:id/bloqueio",
  autenticar,
  autorizar("ADMINISTRADOR"),
  asyncHandler(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
    if (!usuario) throw AppError.naoEncontrado("USUARIO_NAO_ENCONTRADO", "Usuário não encontrado.");

    await Promise.all(chavesDaConta(usuario).map(limparTentativas));
    await registrarAuditoria(req.usuario!.sub, "BLOQUEIO_LOGIN_REMOVIDO", `usuário ${usuario.id}`);

    res.status(204).send();
  }),
);

// zera o 2FA de quem perdeu o celular (so ADMINISTRADOR); a pessoa volta a entrar so com a senha
usuariosRouter.delete(
  "/:id/2fa",
  autenticar,
  autorizar("ADMINISTRADOR"),
  asyncHandler(async (req, res) => {
    await mfaService.resetar(req.params.id, req.usuario!.sub, "resetado por administrador");
    res.status(204).send();
  }),
);
