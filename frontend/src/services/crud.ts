import { ApiError, api } from "./api";

// contrato generico de CRUD, cada pagina so chama esses 5 metodos
export interface CrudService<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(data: Omit<T, "id">): Promise<T>;
  update(id: string, data: Partial<Omit<T, "id">>): Promise<T>;
  remove(id: string): Promise<void>;
}

// implementacao real, fala com o backend
export function createCrudService<T extends { id: string }>(resource: string): CrudService<T> {
  return {
    list() {
      return api.get<T[]>(`/${resource}`);
    },
    async get(id) {
      try {
        return await api.get<T>(`/${resource}/${id}`);
      } catch (e) {
        // 404 aqui nao eh erro de verdade, so significa "nao achei"
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
