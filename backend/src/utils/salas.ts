import type { TipoSala } from "@prisma/client";

// codigo de sala no padrao da UMC: predio (1, 2 ou 3) + andar (T = terreo, 1, 2 ou 3) + "-" + numero de 01 a 21.
// Ex.: 1T-01 (predio 1, terreo, sala 01), 22-07, 33-21. A mesma regra esta em frontend/src/utils/salas.ts
export const REGEX_CODIGO_SALA = /^[1-3][T1-3]-(0[1-9]|1[0-9]|2[01])$/;
export const MENSAGEM_CODIGO_SALA =
  "Código de sala inválido. Use prédio (1 a 3), andar (T, 1, 2 ou 3), hífen e número de 01 a 21, ex.: 1T-01.";

export const ROTULO_TIPO_SALA: Record<TipoSala, string> = {
  SALA_DE_AULA: "Sala de aula",
  LABORATORIO: "Laboratório",
  AUDITORIO: "Auditório",
};

// "1t-01" e " 1T-01 " viram "1T-01"
export function normalizarCodigoSala(codigo: string): string {
  return codigo.trim().toUpperCase();
}

// como a sala aparece em mensagens, e-mails e listas: "1T-01 · Laboratório"
export function rotuloSala(sala: { nome: string; tipo: TipoSala }): string {
  return `${sala.nome} · ${ROTULO_TIPO_SALA[sala.tipo]}`;
}

// ordem por predio, andar (terreo antes do 1) e numero. Codigo fora do padrao (sala antiga) vai pro fim, por nome
function chaveDeOrdem(nome: string): string {
  if (!REGEX_CODIGO_SALA.test(nome)) return `9${nome}`;
  const andar = nome[1] === "T" ? "0" : nome[1];
  return `${nome[0]}${andar}${nome.slice(3)}`;
}

export function compararSalas(a: { nome: string }, b: { nome: string }): number {
  return chaveDeOrdem(a.nome).localeCompare(chaveDeOrdem(b.nome));
}
