import { delay, loadCollection, newId, saveCollection } from "./storage";

export interface CrudService<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(data: Omit<T, "id">): Promise<T>;
  update(id: string, data: Partial<Omit<T, "id">>): Promise<T>;
  remove(id: string): Promise<void>;
}

export function createCrudService<T extends { id: string }>(
  key: string,
  seed: T[],
): CrudService<T> {
  let cache = loadCollection<T>(key, seed);

  return {
    async list() {
      return delay([...cache]);
    },
    async get(id) {
      return delay(cache.find((item) => item.id === id));
    },
    async create(data) {
      const item = { ...data, id: newId() } as T;
      cache = [...cache, item];
      saveCollection(key, cache);
      return delay(item);
    },
    async update(id, data) {
      cache = cache.map((item) => (item.id === id ? { ...item, ...data } : item));
      saveCollection(key, cache);
      const updated = cache.find((item) => item.id === id);
      if (!updated) throw new Error(`Registro ${id} não encontrado em ${key}`);
      return delay(updated);
    },
    async remove(id) {
      cache = cache.filter((item) => item.id !== id);
      saveCollection(key, cache);
      return delay(undefined);
    },
  };
}
