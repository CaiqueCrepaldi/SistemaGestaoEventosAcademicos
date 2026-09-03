// Repositório genérico em memória — o "banco de dados" temporário deste
// backend enquanto o banco de verdade (PostgreSQL) é administrado à parte,
// em outra ferramenta. Guarda os itens num array dentro da própria
// aplicação: funciona pra rodar e testar a API inteira sem precisar de
// nenhum banco configurado, mas os dados **somem a cada reinício do
// servidor** — não é persistência de verdade.
//
// De propósito, cada função de service (em src/modules/*/. service.ts)
// só conversa com o repositório por esta interface (listar/buscar/criar/
// atualizar/remover), nunca manipula o array direto. Assim, quando alguém
// for ligar isso num banco de verdade, a troca é só reimplementar este
// arquivo (ou trocar cada `criarRepositorio<T>()` por uma versão que fala
// com o banco) — nenhum controller/rota precisa mudar.
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
