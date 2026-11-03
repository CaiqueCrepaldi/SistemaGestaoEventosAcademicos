import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { indiceBusca } from "./criptografia";

// mesmo limite pra login e pra solicitar recuperacao de senha — 5 tentativas, 15 min de bloqueio
// (mesma janela ja usada no codigo de recuperacao, so que ali o limite eh sobre o CODIGO em si;
// isto aqui limita quantas vezes alguem tenta logar ou pedir um codigo novo)
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;

// prefixo da chave identifica o fluxo e o alvo: login/recuperacao usam o HMAC do e-mail
// (idDoEmail, nunca e-mail em texto puro), o codigo do 2FA usa o id do usuario — ou o IP
export function chaveConta(fluxo: "login" | "recuperacao" | "mfa", identificador: string): string {
  return `${fluxo}:conta:${identificador}`;
}
export function chaveIp(fluxo: "login" | "recuperacao", ip: string): string {
  return `${fluxo}:ip:${ip}`;
}

// true se a chave esta bloqueada agora; se o bloqueio ja venceu, reseta sozinho e devolve false
export async function estaBloqueado(chave: string): Promise<boolean> {
  const registro = await prisma.limiteAcesso.findUnique({ where: { chave } });
  if (!registro?.bloqueadoAte) return false;
  if (registro.bloqueadoAte > new Date()) return true;

  await prisma.limiteAcesso.update({ where: { chave }, data: { tentativas: 0, bloqueadoAte: null } });
  return false;
}

// conta uma tentativa (login errado, ou qualquer chamada de solicitacao de recuperacao — nesse
// segundo caso conta toda chamada, nao so falha, porque o que se quer limitar e a frequencia do
// pedido em si); ao atingir o limite, bloqueia por BLOQUEIO_MS a partir de agora
export async function incrementarTentativa(chave: string): Promise<void> {
  const registro = await prisma.limiteAcesso.upsert({
    where: { chave },
    create: { id: randomUUID(), chave, tentativas: 1 },
    update: { tentativas: { increment: 1 } },
  });
  if (registro.tentativas >= MAX_TENTATIVAS && !registro.bloqueadoAte) {
    await prisma.limiteAcesso.update({ where: { chave }, data: { bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS) } });
  }
}

// sucesso (login certo) limpa o contador da CONTA — o de IP fica, ele so expira sozinho
export async function limparTentativas(chave: string): Promise<void> {
  await prisma.limiteAcesso.deleteMany({ where: { chave } });
}

// identificador da conta nas chaves de login/recuperacao: HMAC do e-mail (indiceBusca), calculado na
// hora — a tabela limites_acesso nunca guarda o e-mail em texto puro, nem de quem nao tem conta
export function idDoEmail(email: string): string {
  return indiceBusca(email);
}

// chaves POR CONTA (nao por IP) que travam o acesso de um usuario: login e recuperacao de senha
// pelo HMAC do e-mail, codigo do 2FA pelo id. Fonte unica pra listar e pra desbloquear
export function chavesDaConta(usuario: { id: string; emailLogin: string }): string[] {
  return [
    chaveConta("login", idDoEmail(usuario.emailLogin)),
    chaveConta("recuperacao", idDoEmail(usuario.emailLogin)),
    chaveConta("mfa", usuario.id),
  ];
}

// todas as chaves com bloqueio valendo agora, numa consulta so (pra montar lista sem uma consulta por linha)
export async function chavesBloqueadasAgora(): Promise<Set<string>> {
  const bloqueios = await prisma.limiteAcesso.findMany({ where: { bloqueadoAte: { gt: new Date() } }, select: { chave: true } });
  return new Set(bloqueios.map((bloqueio) => bloqueio.chave));
}

export function contaBloqueada(chavesBloqueadas: Set<string>, usuario: { id: string; emailLogin: string }): boolean {
  return chavesDaConta(usuario).some((chave) => chavesBloqueadas.has(chave));
}
