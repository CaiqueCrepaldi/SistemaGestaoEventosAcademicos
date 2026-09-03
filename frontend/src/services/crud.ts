import { ApiError, USE_MOCK, api } from "./api";
import { delay, loadCollection, newId, saveCollection } from "./storage";

// Contrato genérico de CRUD que toda entidade simples (Evento, Sala,
// Palestrante, Participante, Inscrição, Feedback) usa. Cada página chama
// só esses 5 métodos — não importa se por baixo é localStorage ou uma API
// de verdade.
export interface CrudService<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(data: Omit<T, "id">): Promise<T>;
  update(id: string, data: Partial<Omit<T, "id">>): Promise<T>;
  remove(id: string): Promise<void>;
}

// Implementação "de mentira" que guarda tudo em localStorage. `cache` é o
// array em memória — é carregado uma vez (loadCollection) e depois cada
// operação atualiza tanto o cache quanto o localStorage, pra manter os dois
// sincronizados.
function createLocalCrudService<T extends { id: string }>(key: string, seed: T[]): CrudService<T> {
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

// Implementação real, que fala com o backend Java via HTTP. Cada método é
// só um espelho de um verbo REST — a lógica de fato (validação, permissão
// por perfil etc.) mora no servidor, não aqui.
function createHttpCrudService<T extends { id: string }>(resource: string): CrudService<T> {
  return {
    list() {
      return api.get<T[]>(`/${resource}`);
    },
    async get(id) {
      try {
        return await api.get<T>(`/${resource}/${id}`);
      } catch (e) {
        // 404 aqui não é erro de verdade pra quem chamou — só significa
        // "não achei esse registro", então vira `undefined` em vez de throw.
        if (e instanceof ApiError && e.status === 404) return undefined;
        throw e;
      }
    },
    create(data) {
      return api.post<T>(`/${resource}`, data);
    },
    update(id, data) {
      return api.put<T>(`/${resource}/${id}`, data);
    },
    remove(id) {
      return api.del<void>(`/${resource}/${id}`);
    },
  };
}

// key dobra de função: chave do localStorage no mock, path do recurso no modo http.
// storageKey é opcional e só deve ser usado quando o formato dos dados salvos em
// localStorage mudou de forma incompatível (ex.: campo renomeado/removido) — assim
// evitamos misturar registros antigos, no formato velho, com o novo seed.
export function createCrudService<T extends { id: string }>(
  key: string,
  seed: T[],
  storageKey: string = key,
): CrudService<T> {
  // A troca entre mock e HTTP acontece uma única vez aqui, na criação do
  // serviço — cada página nem sabe qual dos dois está usando por baixo.
  return USE_MOCK ? createLocalCrudService<T>(storageKey, seed) : createHttpCrudService<T>(key);
}
