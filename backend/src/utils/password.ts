import bcrypt from "bcryptjs";

const CUSTO_HASH = 10;

// gera o hash bcrypt da senha em texto puro
export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_HASH);
}

// compara a senha digitada com o hash salvo
export function conferirSenha(senhaTextoPuro: string, hashSalvo: string): Promise<boolean> {
  return bcrypt.compare(senhaTextoPuro, hashSalvo);
}
