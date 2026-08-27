const PREFIX = "sgea";

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

export function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
