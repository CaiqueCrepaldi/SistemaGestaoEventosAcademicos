import bcrypt from "bcryptjs";

// bcrypt gera um salt aleatorio de 128 bits a cada hash e embute esse salt no proprio texto do
// hash ($2a$<custo>$<22 caracteres de salt><31 caracteres de hash>) — a mesma senha nunca gera o
// mesmo hash. Custo 12 = 2^12 rodadas; hash antigo com custo menor e refeito no proximo login
export const CUSTO_HASH = 12;

// gera o hash bcrypt da senha em texto puro
export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_HASH);
}

// compara a senha digitada com o hash salvo (o custo e o salt saem do proprio hash)
export function conferirSenha(senhaTextoPuro: string, hashSalvo: string): Promise<boolean> {
  return bcrypt.compare(senhaTextoPuro, hashSalvo);
}

// custo gravado no proprio hash (os 2 digitos depois de "$2a$")
export function custoDoHash(hashSalvo: string): number {
  return bcrypt.getRounds(hashSalvo);
}

// hash gravado com custo menor que o atual: da pra refazer no login, quando a senha em texto puro
// esta disponivel por um instante — sem ninguem precisar trocar a senha
export function precisaRefazerHash(hashSalvo: string): boolean {
  return custoDoHash(hashSalvo) < CUSTO_HASH;
}
