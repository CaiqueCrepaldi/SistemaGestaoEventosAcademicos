import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { indiceBusca } from "./criptografia";

// mesmo limite pra login e pra solicitar recuperacao de senha — 5 tentativas por CONTA, 15 min de
// bloqueio (mesma janela ja usada no codigo de recuperacao, so que ali o limite eh sobre o CODIGO em
// si; isto aqui limita quantas vezes alguem tenta logar ou pedir um codigo novo)
const MAX_TENTATIVAS = 5;
// por IP o limite e maior: numa rede compartilhada (Wi-Fi da faculdade, NAT) muita gente sai pelo
// mesmo IP, e 5 erros de pessoas diferentes nao podem travar o login de todo mundo. O limite por
// conta continua 5, entao chutar senha de UMA conta segue bloqueado do mesmo jeito
export const MAX_TENTATIVAS_POR_IP = 20;
const BLOQUEIO_MS = 15 * 60 * 1000;

// prefixo da chave identifica o fluxo e o alvo: login/recuperacao/cadastro usam o HMAC do e-mail
// (idDoEmail, nunca e-mail em texto puro), o codigo do 2FA usa o id do usuario — ou o IP.
// "cadastro" conta os envios do codigo de confirmacao do e-mail (cadastro + reenvios)
export function chaveConta(fluxo: "login" | "recuperacao" | "mfa" | "cadastro" | "primeiro-acesso", identificador: string): string {
  return `${fluxo}:conta:${identificador}`;
}
// "validacao" = consulta publica de certificado (sem login), limitada so por IP
export function chaveIp(fluxo: "login" | "recuperacao" | "validacao" | "cadastro" | "primeiro-acesso", ip: string): string {
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
// pedido em si); ao atingir o limite, bloqueia por BLOQUEIO_MS a partir de agora. "limite" so muda
// pra fluxo que conta TODA consulta legitima (validacao publica de certificado), o resto usa o padrao
export async function incrementarTentativa(chave: string, limite = MAX_TENTATIVAS): Promise<void> {
  const registro = await prisma.limiteAcesso.upsert({
    where: { chave },
    create: { id: randomUUID(), chave, tentativas: 1 },
    update: { tentativas: { increment: 1 } },
  });
  if (registro.tentativas >= limite && !registro.bloqueadoAte) {
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
