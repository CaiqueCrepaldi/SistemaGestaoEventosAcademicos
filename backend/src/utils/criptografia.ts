import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { env } from "../config/env";

// AES-256-GCM com IV aleatorio a cada chamada: o mesmo texto de entrada gera
// uma saida diferente sempre que criptografado de novo (protege contra analise
// de padrao/frequencia em cima do banco). Hoje so o segredo do 2FA passa por aqui:
// e uma credencial que o servidor precisa ler de volta. Nome, e-mail e RGM ficam
// em texto puro (dados pessoais comuns) e senhas/codigos ficam so como hash
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

// hash deterministico (HMAC-SHA256, normalizado trim+minusculo), sem volta: identifica o e-mail
// nas chaves do limite de tentativas (sem guardar o e-mail) e guarda os codigos de recuperacao do 2FA
export function indiceBusca(texto: string): string {
  return createHmac("sha256", chave()).update(texto.trim().toLowerCase()).digest("hex");
}
