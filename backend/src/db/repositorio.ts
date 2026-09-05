// repositorio generico em memoria, o "banco" enquanto nao pluga um de verdade
// os dados somem a cada restart do servidor
// services so falam com isso por essa interface, nunca mexem no array direto
export interface Repositorio<T extends { id: string }> {
  listar(): T[];
  listarComFiltro(predicado: (item: T) => boolean): T[];
  buscarPorId(id: string): T | undefined;
  buscarUm(predicado: (item: T) => boolean): T | undefined;
  contar(predicado: (item: T) => boolean): number;
  criar(item: T): T;
  atualizar(id: string, dados: Partial<Omit<T, "id">>): T | undefined;
  remover(id: string): boolean;
}

export function criarRepositorio<T extends { id: string }>(dadosIniciais: T[] = []): Repositorio<T> {
  let itens: T[] = [...dadosIniciais];

  return {
    listar() {
      return [...itens];
    },
    listarComFiltro(predicado) {
      return itens.filter(predicado);
    },
    buscarPorId(id) {
      return itens.find((item) => item.id === id);
    },
    buscarUm(predicado) {
      return itens.find(predicado);
    },
    contar(predicado) {
      return itens.filter(predicado).length;
    },
    criar(item) {
      itens.push(item);
      return item;
    },
    atualizar(id, dados) {
      const indice = itens.findIndex((item) => item.id === id);
      if (indice === -1) return undefined;
      itens[indice] = { ...itens[indice], ...dados };
      return itens[indice];
    },
    remover(id) {
      const tamanhoAntes = itens.length;
      itens = itens.filter((item) => item.id !== id);
      return itens.length < tamanhoAntes;
    },
  };
}
