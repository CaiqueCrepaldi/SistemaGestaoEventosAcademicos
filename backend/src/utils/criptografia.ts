import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { env } from "../config/env";

// AES-256-GCM com IV aleatorio a cada chamada: o mesmo texto de entrada gera
// uma saida diferente sempre que criptografado de novo (protege contra analise
// de padrao/frequencia em cima do banco, mas por isso nao da pra buscar por
// igualdade direto na coluna cifrada — usar indiceBusca() pra isso)
const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

function chave(): Buffer {
  const buffer = Buffer.from(env.encryptionKey, "base64");
  if (buffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY precisa decodificar (base64) pra exatamente 32 bytes (AES-256).");
  }
  return buffer;
}

// criptografa um texto; formato salvo eh base64(iv + authTag + cifrado)
export function criptografar(texto: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, cifrado]).toString("base64");
}

// reverte criptografar(); estoura (tag invalida) se o texto nao foi cifrado com essa mesma chave
export function descriptografar(textoCifrado: string): string {
  const dados = Buffer.from(textoCifrado, "base64");
  const iv = dados.subarray(0, TAMANHO_IV);
  const tag = dados.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_TAG);
  const cifrado = dados.subarray(TAMANHO_IV + TAMANHO_TAG);
  const decipher = createDecipheriv(ALGORITMO, chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}

// hash deterministico (HMAC-SHA256, normalizado trim+minusculo) usado so como indice
// de busca exata (login por e-mail, checagem de duplicidade) — nunca pra exibir/decifrar
export function indiceBusca(texto: string): string {
  return createHmac("sha256", chave()).update(texto.trim().toLowerCase()).digest("hex");
}
