const PREFIX = "sgea";

export function loadCollection<T>(key: string, seed: T[]): T[] {
  const raw = localStorage.getItem(`${PREFIX}:${key}`);
  if (!raw) {
    localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw) as T[];
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
