// regras de formatacao usadas em Cadastro/Participantes/Palestrantes/Eventos
// backend replica as mesmas regras em backend/src/utils/validacao.ts

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
const REGEX_RGM = /^[A-Z0-9]{11}$/;
const REGEX_TELEFONE = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export const RGM_TAMANHO = 11;

export function validarEmail(valor: string): boolean {
  return REGEX_EMAIL.test(valor.trim());
}

export function validarNome(valor: string): boolean {
  return REGEX_NOME.test(valor.trim());
}

// deixa so letra/numero maiusculo, usado no onChange do campo de rgm tambem
export function normalizarRgm(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validarRgm(valor: string): boolean {
  return REGEX_RGM.test(valor);
}

export function validarTelefone(valor: string): boolean {
  return REGEX_TELEFONE.test(valor.trim());
}

// mascara (00) 00000-0000 enquanto digita
export function maskTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 2) return digitos.length ? `(${digitos}` : "";
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}
