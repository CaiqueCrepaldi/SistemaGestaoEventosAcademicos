// regras de formatacao usadas nos schemas zod de participantes/palestrantes/auth
// espelha frontend/src/utils/validacao.ts

export const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
export const REGEX_RGM = /^[0-9]{11}$/;
export const REGEX_TELEFONE = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export const RGM_TAMANHO = 11;

// deixa so digito, usado no .transform() do schema de rgm
export function normalizarRgm(valor: string): string {
  return valor.replace(/\D/g, "");
}
