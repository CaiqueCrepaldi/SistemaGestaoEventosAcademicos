import { descriptografar } from "./criptografia";

// Transicao da decisao de nao criptografar mais nome/e-mail/RGM (dados pessoais comuns, art. 5º, I
// da LGPD — nao sao sensiveis). Gravacao nova ja sai em texto puro; ate o script
// scripts/converter-dados-pessoais.ts decifrar os registros antigos, a leitura precisa aceitar os
// dois formatos. O segredo do 2FA NAO passa por aqui: ele continua cifrado (credencial de acesso).

// formato gravado por criptografar(): base64(iv 12 bytes + tag 16 bytes + texto cifrado)
const MINIMO_BYTES_CIFRADO = 12 + 16 + 1;

export function pareceCifrado(valor: string): boolean {
  return (
    valor.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(valor) &&
    Buffer.from(valor, "base64").length >= MINIMO_BYTES_CIFRADO
  );
}

// valor cifrado que decifra de verdade com a ENCRYPTION_KEY (a tag do AES-GCM confere) vira o texto
// original; qualquer outra coisa ja e texto puro. null = nao e um valor cifrado (ou nao decifrou)
export function decifrarSeCifrado(valor: string): string | null {
  if (!pareceCifrado(valor)) return null;
  try {
    return descriptografar(valor);
  } catch {
    return null;
  }
}

// le nome/e-mail/RGM independente do formato em que o registro esta gravado hoje
export function lerDadoPessoal(valor: string): string {
  return decifrarSeCifrado(valor) ?? valor;
}

export function lerDadoPessoalOuNulo(valor: string | null): string | null {
  return valor === null ? null : lerDadoPessoal(valor);
}
