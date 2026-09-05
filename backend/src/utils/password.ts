import bcrypt from "bcryptjs";

const CUSTO_HASH = 10;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_HASH);
}

export function conferirSenha(senhaTextoPuro: string, hashSalvo: string): Promise<boolean> {
  return bcrypt.compare(senhaTextoPuro, hashSalvo);
}
