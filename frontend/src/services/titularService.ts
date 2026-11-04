import type { StatusPresenca } from "../types";
import { api } from "./api";

// RF026: o que GET /api/meus-dados devolve (mesmo conteudo do arquivo da exportacao)
export interface MeusDados {
  geradoEm: string;
  dadosCadastrais: {
    nome: string;
    email: string;
    rgm: string;
    cadastradoEm: string;
    termos: { aceitoEm: string | null; versao: string | null };
    doisFatores: { ativo: boolean; ativadoEm: string | null };
  };
  inscricoes: { evento: string; dataEvento: string; inscritoEm: string; presenca: StatusPresenca; checkinEm: string | null }[];
  questionarios: { evento: string; respondidoEm: string; acertos: number; totalPerguntas: number; percentual: number }[];
  certificados: {
    evento: string;
    dataEvento: string;
    cargaHoraria: number;
    codigoValidacao: string;
    emitidoEm: string;
    nomeImpresso: string;
    rgmImpresso: string;
  }[];
  avaliacoes: { evento: string; nota: number; comentario: string; enviadaEm: string }[];
}

export const NOME_ARQUIVO_EXPORTACAO = "meus-dados-sgea.json";

// entrega o arquivo ao navegador como download, sem abrir aba nova
function salvarArquivo(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const titularService = {
  meusDados(): Promise<MeusDados> {
    return api.get<MeusDados>("/meus-dados");
  },
  // o backend registra o pedido (solicitacao EXPORTACAO atendida + auditoria) e devolve o arquivo
  async baixarExportacao(): Promise<void> {
    salvarArquivo(await api.baixar("/meus-dados/exportacao"), NOME_ARQUIVO_EXPORTACAO);
  },
};
