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

// cria um repositorio novo ja carregado com os dados de seed
export function criarRepositorio<T extends { id: string }>(dadosIniciais: T[] = []): Repositorio<T> {
  let itens: T[] = [...dadosIniciais];

  return {
    // copia do array inteiro, pra quem recebe nao mexer no estado interno
    listar() {
      return [...itens];
    },
    // lista so os itens que passam no predicado
    listarComFiltro(predicado) {
      return itens.filter(predicado);
    },
    // busca um item pelo id
    buscarPorId(id) {
      return itens.find((item) => item.id === id);
    },
    // busca o primeiro item que bate com o predicado
    buscarUm(predicado) {
      return itens.find(predicado);
    },
    // conta quantos itens batem com o predicado
    contar(predicado) {
      return itens.filter(predicado).length;
    },
    // adiciona um item novo
    criar(item) {
      itens.push(item);
      return item;
    },
    // faz merge parcial nos dados do item, undefined se o id nao existir
    atualizar(id, dados) {
      const indice = itens.findIndex((item) => item.id === id);
      if (indice === -1) return undefined;
      itens[indice] = { ...itens[indice], ...dados };
      return itens[indice];
    },
    // remove pelo id, devolve se removeu algo de fato
    remover(id) {
      const tamanhoAntes = itens.length;
      itens = itens.filter((item) => item.id !== id);
      return itens.length < tamanhoAntes;
    },
  };
}
