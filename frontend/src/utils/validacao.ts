// regras de formatacao usadas em Cadastro/Participantes/Palestrantes/Eventos
// backend replica as mesmas regras em backend/src/utils/validacao.ts

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
const REGEX_RGM = /^[0-9]{11}$/;

export const RGM_TAMANHO = 11;

// confere formato basico de email (algo@algo.algo)
export function validarEmail(valor: string): boolean {
  return REGEX_EMAIL.test(valor.trim());
}

// so letras/acento/espaco/hifen, sem numero
export function validarNome(valor: string): boolean {
  return REGEX_NOME.test(valor.trim());
}

// deixa so digito, usado no onChange do campo de rgm tambem
export function normalizarRgm(valor: string): string {
  return valor.replace(/\D/g, "");
}

// exatamente 11 digitos
export function validarRgm(valor: string): boolean {
  return REGEX_RGM.test(valor);
}
