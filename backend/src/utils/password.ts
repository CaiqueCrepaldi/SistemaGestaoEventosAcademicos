import bcrypt from "bcryptjs";

const CUSTO_HASH = 10; // "salt rounds" — padrão recomendado pelo bcrypt

// Transforma a senha em texto puro num hash irreversível antes de salvar no
// banco — é assim que garantimos que ninguém (nem quem tem acesso ao banco)
// consegue ler a senha de verdade de um usuário.
export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_HASH);
}

// Compara a senha digitada no login com o hash salvo — bcrypt.compare faz
// o hash da senha digitada e compara os dois hashes, nunca descriptografa
// o hash salvo (bcrypt não é reversível por design).
export function conferirSenha(senhaTextoPuro: string, hashSalvo: string): Promise<boolean> {
  return bcrypt.compare(senhaTextoPuro, hashSalvo);
}
