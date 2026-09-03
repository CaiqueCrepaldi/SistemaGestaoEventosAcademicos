// Regras de formatação reaproveitadas em todo formulário do site que tenha
// esses campos (Cadastro, Participantes, Palestrantes, Eventos). Mantidas
// simples e sem dependência externa, iguais ao estilo do resto do projeto —
// o backend replica as mesmas regras em backend/src/utils/validacao.ts.

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Letras (com acento), espaço, apóstrofo e hífen — nomes compostos ou com
// sobrenome estrangeiro continuam válidos, números nunca.
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

// Deixa só letras/números e maiúsculo — usado tanto pra validar quanto pra
// normalizar o campo enquanto a pessoa digita (onChange do input de RGM).
export function normalizarRgm(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validarRgm(valor: string): boolean {
  return REGEX_RGM.test(valor);
}

export function validarTelefone(valor: string): boolean {
  return REGEX_TELEFONE.test(valor.trim());
}

// Aplica a máscara (##) #####-#### (ou (##) ####-#### pra fixo) enquanto a
// pessoa digita, a partir só dos dígitos informados.
export function maskTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 2) return digitos.length ? `(${digitos}` : "";
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}
