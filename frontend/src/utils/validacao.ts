// regras de formatacao usadas em Cadastro/Participantes/Palestrantes/Eventos
// backend replica as mesmas regras em backend/src/utils/validacao.ts

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
const REGEX_RGM = /^[0-9]{11}$/;

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

// regra de toda senha NOVA (cadastro e nova senha da recuperacao) — igual a do backend
// (backend/src/utils/validacao.ts). O login nao confere isto: quem ja tem conta entra com a senha que tem
export const SENHA_MIN_CARACTERES = 8;
export const SENHA_MAX_CARACTERES = 64;
export const MENSAGEM_REGRA_SENHA =
  "A senha deve ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e um caractere especial.";

export interface RequisitosSenha {
  minimo: boolean;
  maximo: boolean;
  maiuscula: boolean;
  numero: boolean;
  // qualquer caractere que nao seja letra, numero ou espaco (ex.: ! @ # $ %)
  especial: boolean;
}

// cada requisito separado (a lista de conferencia embaixo do campo). O tamanho conta caracteres de
// verdade (Array.from), nao unidades UTF-16 — um emoji vale 1. Maiuscula acentuada conta
export function requisitosDaSenha(senha: string): RequisitosSenha {
  const tamanho = Array.from(senha).length;
  return {
    minimo: tamanho >= SENHA_MIN_CARACTERES,
    maximo: tamanho <= SENHA_MAX_CARACTERES,
    maiuscula: /\p{Lu}/u.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[^\p{L}\p{N}\s]/u.test(senha),
  };
}

export function validarSenhaNova(senha: string): boolean {
  return Object.values(requisitosDaSenha(senha)).every(Boolean);
}
