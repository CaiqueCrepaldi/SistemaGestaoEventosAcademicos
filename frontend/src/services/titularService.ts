import type { StatusPresenca } from "../types";
import { api } from "./api";

// RF026: o que GET /api/meus-dados devolve — tudo o que o sistema guarda sobre o aluno
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
  inscricoes: { evento: string; dataEvento: string; inscritoEm: string; presenca: StatusPresenca; checkinPedidoEm: string | null; checkinEm: string | null }[];
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

export const titularService = {
  meusDados(): Promise<MeusDados> {
    return api.get<MeusDados>("/meus-dados");
  },
};
