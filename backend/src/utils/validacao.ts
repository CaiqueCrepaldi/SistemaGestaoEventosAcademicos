// regras de formatacao usadas nos schemas zod de participantes/palestrantes/auth
// espelha frontend/src/utils/validacao.ts

export const REGEX_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\s-]*$/;
export const REGEX_RGM = /^[0-9]{11}$/;

// deixa so digito, usado no .transform() do schema de rgm
export function normalizarRgm(valor: string): string {
  return valor.replace(/\D/g, "");
}

// regra de toda senha NOVA (cadastro e nova senha da recuperacao) — o login nao confere isto, quem ja
// tem conta continua entrando com a senha que tem. De 8 a 64 caracteres, com pelo menos uma letra
// maiuscula (acentuada conta), um numero e um caractere especial (qualquer caractere que nao seja
// letra, numero ou espaco). Mesma regra em frontend/src/utils/validacao.ts (RNF006)
export const SENHA_MIN_CARACTERES = 8;
export const SENHA_MAX_CARACTERES = 64;
export const MENSAGEM_REGRA_SENHA =
  "A senha deve ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e um caractere especial.";

export interface RequisitosSenha {
  minimo: boolean;
  maximo: boolean;
  maiuscula: boolean;
  numero: boolean;
  especial: boolean;
}

// confere cada requisito separado. O tamanho conta caracteres de verdade (Array.from), nao unidades
// UTF-16 — um emoji vale 1
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

export function senhaAtendeRegras(senha: string): boolean {
  return Object.values(requisitosDaSenha(senha)).every(Boolean);
}

// e-mail de login e gravado e buscado sempre assim (usuarios.emailLogin e a chave unica): "Fulano@UMC.br " = "fulano@umc.br"
export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}
