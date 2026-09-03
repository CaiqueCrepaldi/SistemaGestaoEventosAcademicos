const PREFIX = "sgea";

// Carrega uma coleção do localStorage. Se a chave ainda não existir (primeiro
// acesso do navegador), grava o seed inteiro e devolve ele. Se já existir,
// faz um "merge" pelo id: qualquer item novo que foi adicionado ao seed
// depois (numa atualização do sistema) é incluído, sem apagar o que o
// usuário já tinha salvo/editado. Sem esse merge, quem já usou o site antes
// nunca veria dado novo do seed — ficaria preso na versão antiga pra sempre.
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

// Sobrescreve a coleção inteira no localStorage — chamado depois de
// create/update/remove, já que o mock guarda tudo em memória e precisa
// persistir a cada mudança.
export function saveCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(data));
}

// Gera um id único pra registro novo no modo mock (no backend real isso
// seria responsabilidade do banco de dados).
export function newId(): string {
  return crypto.randomUUID();
}

// Simula a latência de uma chamada de rede de verdade, pra telas de
// loading/spinner terem sentido mesmo rodando 100% local.
export function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
