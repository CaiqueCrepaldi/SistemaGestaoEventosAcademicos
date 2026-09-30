import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/prisma";
import { usuarioParaDTO } from "../../utils/dto";
import { lerDadoPessoal } from "../../utils/dadosPessoais";
import { usuarioParaDominio } from "../auth/auth.service";
import { mfaService } from "../mfa/mfa.service";
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

// lista todas as contas pra tela de usuarios (so ADMINISTRADOR): situacao do 2FA e se esta
// bloqueada por excesso de tentativas agora — sem RGM nem nada alem do necessario pra essa tela
usuariosRouter.get(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR"),
  asyncHandler(async (_req, res) => {
    const [usuarios, bloqueios] = await Promise.all([
      prisma.usuario.findMany({
        select: {
          id: true,
          nome: true,
          emailLogin: true,
          emailLoginHash: true,
          perfil: true,
          mfaAtivo: true,
          participante: { select: { ativo: true } },
        },
      }),
      prisma.limiteAcesso.findMany({ where: { bloqueadoAte: { gt: new Date() } }, select: { chave: true } }),
    ]);
    const chavesBloqueadas = new Set(bloqueios.map((b) => b.chave));

    const lista = usuarios
      .map((u) => ({
        id: u.id,
        nome: lerDadoPessoal(u.nome),
        emailLogin: lerDadoPessoal(u.emailLogin),
        perfil: u.perfil,
        mfaAtivo: u.mfaAtivo,
        // so aluno e inativado (pela equipe); conta de equipe nao tem participante
        inativo: u.participante ? !u.participante.ativo : false,
        bloqueado:
          chavesBloqueadas.has(chaveConta("login", u.emailLoginHash)) ||
          chavesBloqueadas.has(chaveConta("recuperacao", u.emailLoginHash)) ||
          chavesBloqueadas.has(chaveConta("mfa", u.id)),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    res.status(200).json(lista);
  }),
);

// remove o bloqueio por excesso de tentativas (login, recuperacao de senha e codigo do 2FA) de
// uma conta especifica — so ADMINISTRADOR, nao derruba o bloqueio por IP (esse so expira sozinho)
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
      limparTentativas(mfaService.chaveMfa(usuario.id)),
    ]);
    await registrarAuditoria(req.usuario!.sub, "BLOQUEIO_LOGIN_REMOVIDO", `usuário ${usuario.id}`);

    res.status(204).send();
  }),
);

// zera o 2FA de quem perdeu o celular (so ADMINISTRADOR); a pessoa configura de novo no proximo login
usuariosRouter.delete(
  "/:id/2fa",
  autenticar,
  autorizar("ADMINISTRADOR"),
  asyncHandler(async (req, res) => {
    await mfaService.resetar(req.params.id, req.usuario!.sub, "resetado por administrador");
    res.status(204).send();
  }),
);
