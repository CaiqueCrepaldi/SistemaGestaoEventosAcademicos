// Regras de formatação usadas dentro dos schemas zod dos módulos que
// cadastram pessoas (participantes, palestrantes, auth). Espelha
// exatamente as mesmas regras do frontend (frontend/src/utils/validacao.ts)
// — duplicadas de propósito, já que aqui é o backend que valida "de
// verdade" e o frontend só dá feedback rápido antes de chamar a API.

export const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
export const REGEX_RGM = /^[A-Z0-9]{11}$/;
export const REGEX_TELEFONE = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export const RGM_TAMANHO = 11;

export function normalizarRgm(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
