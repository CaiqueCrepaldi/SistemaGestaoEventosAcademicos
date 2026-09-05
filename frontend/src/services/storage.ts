const PREFIX = "sgea";

// carrega uma colecao do localStorage, se a chave nao existir grava o seed inteiro
// se ja existir, faz merge pelo id: item novo do seed entra sem apagar o que o usuario ja tinha
export function loadCollection<T extends { id: string }>(key: string, seed: T[]): T[] {
  const raw = localStorage.getItem(`${PREFIX}:${key}`);
  if (!raw) {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(seed));
    return seed;
  }

  const existente = JSON.parse(raw) as T[];
  const idsExistentes = new Set(existente.map((item) => item.id));
  const novosDoSeed = seed.filter((item) => !idsExistentes.has(item.id));
  if (novosDoSeed.length === 0) return existente;

  const atualizado = [...existente, ...novosDoSeed];
  localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(atualizado));
  return atualizado;
}

export function saveCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(data));
}

export function newId(): string {
  return crypto.randomUUID();
}

// simula latencia de rede pra loading/spinner fazer sentido mesmo 100% local
export function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
