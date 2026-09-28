import type { NextFunction, Request, Response } from "express";
import type { Perfil } from "../types/domain";
import type { TipoTokenEtapa } from "../types/express";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { verificarToken, type PayloadToken } from "../utils/jwt";
import { prisma } from "../db/prisma";

// le o header Authorization e confere assinatura/prazo do token
function lerToken(req: Request): PayloadToken {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw AppError.naoAutenticado("Token ausente. Envie o header Authorization: Bearer <token>.");
  }
  try {
    return verificarToken(header.slice("Bearer ".length));
  } catch {
    throw AppError.naoAutenticado();
  }
}

// confere se o token nao foi invalidado depois de emitido (troca de senha, inativacao, reset do
// 2FA — ver Usuario.versaoToken). Por isso consulta o banco a cada requisicao
async function conferirVersao(payload: PayloadToken) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { versaoToken: true, perfil: true, mfaAtivo: true },
  });
  // token sem "versaoToken" foi emitido antes desse controle existir — vale como versao 1
  // (o default de toda conta), entao ninguem e deslogado so por causa do deploy dessa feature
  if (!usuario || (payload.versaoToken ?? 1) !== usuario.versaoToken) {
    throw AppError.naoAutenticado("Sessão inválida. Faça login novamente.");
  }
  return usuario;
}

// sessao normal: recusa token de etapa do 2FA e equipe que ainda nao configurou o 2FA
async function validarSessao(req: Request, payload: PayloadToken) {
  if (payload.tipo) throw AppError.naoAutenticado("Token inválido para esta rota.");
  const usuario = await conferirVersao(payload);
  // 2FA e obrigatorio pra ADMINISTRADOR/SECRETARIA: uma sessao aberta sem ele (ex.: emitida antes
  // do deploy do 2FA) cai aqui, o front desloga e o proximo login leva pra configuracao
  if (usuario.perfil !== "ALUNO" && !usuario.mfaAtivo) {
    throw new AppError(401, "MFA_OBRIGATORIO", "Configure a autenticação em dois fatores para continuar. Entre novamente.");
  }
  req.usuario = payload;
}

async function validarEtapa(req: Request, payload: PayloadToken, tipos: TipoTokenEtapa[]) {
  if (!payload.tipo || !tipos.includes(payload.tipo)) {
    throw AppError.naoAutenticado("Token inválido para esta etapa.");
  }
  await conferirVersao(payload);
  req.etapaMfa = { usuarioId: payload.sub, tipo: payload.tipo };
}

// exige Authorization: Bearer <token de sessao>, anexa os dados em req.usuario
export const autenticar = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await validarSessao(req, lerToken(req));
  next();
});

// rota de uma etapa do login em duas etapas: SO aceita o token temporario daquele tipo
export function autenticarEtapaMfa(...tipos: TipoTokenEtapa[]) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    await validarEtapa(req, lerToken(req), tipos);
    next();
  });
}

// configurar o 2FA: aluno ja logado (ativacao opcional) ou equipe no meio do login (token de configuracao)
export const autenticarSessaoOuConfiguracaoMfa = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const payload = lerToken(req);
  if (payload.tipo) await validarEtapa(req, payload, ["mfa_configuracao"]);
  else await validarSessao(req, payload);
  next();
});

// restringe a rota a um ou mais perfis, roda depois do autenticar
export function autorizar(...perfis: Perfil[]) {
  // middleware que checa se o perfil do token ta na lista permitida
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      throw AppError.acessoNegado();
    }
    next();
  };
}
