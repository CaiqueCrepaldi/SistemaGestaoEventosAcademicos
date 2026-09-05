import type { Evento, PerguntaQuestionario, TentativaQuestionario } from "../types";
import { corrigirRespostas } from "../utils/questionario";
import { ApiError, USE_MOCK, api } from "./api";
import { eventoService } from "./entityServices";
import { delay, loadCollection, newId, saveCollection } from "./storage";

const TENTATIVAS_KEY = "tentativas-questionario";

// pergunta sem revelar a correta, formato que o aluno recebe pra responder
export interface PerguntaSemGabarito {
  id: string;
  enunciado: string;
  alternativas: { texto: string }[];
}

function ocultarGabarito(perguntas: PerguntaQuestionario[]): PerguntaSemGabarito[] {
  return perguntas.map((p) => ({
    id: p.id,
    enunciado: p.enunciado,
    alternativas: p.alternativas.map((a) => ({ texto: a.texto })),
  }));
}

interface QuestionarioService {
  obterQuestionario(eventoId: string): Promise<PerguntaSemGabarito[]>;
  enviarRespostas(eventoId: string, participanteId: string, respostas: number[]): Promise<TentativaQuestionario>;
  listarTentativas(eventoId: string, participanteId: string): Promise<TentativaQuestionario[]>;
  listarTodasTentativas(): Promise<TentativaQuestionario[]>;
}

async function buscarEventoOuFalhar(eventoId: string): Promise<Evento> {
  const evento = await eventoService.get(eventoId);
  if (!evento) throw new ApiError(404, "Evento não encontrado.", "EVENTO_NAO_ENCONTRADO");
  return evento;
}

// mock guarda as tentativas numa colecao propria, fora do createCrudService generico
const localQuestionarioService: QuestionarioService = {
  async obterQuestionario(eventoId) {
    const evento = await buscarEventoOuFalhar(eventoId);
    return delay(ocultarGabarito(evento.questionario));
  },

  async enviarRespostas(eventoId, participanteId, respostas) {
    const evento = await buscarEventoOuFalhar(eventoId);
    if (respostas.length !== evento.questionario.length || respostas.some((r) => r === undefined || r === null)) {
      throw new ApiError(422, "Responda todas as perguntas do questionário antes de enviar.", "RESPOSTAS_INCOMPLETAS");
    }

    const { acertos, totalPerguntas, percentual } = corrigirRespostas(evento.questionario, respostas);
    const tentativa: TentativaQuestionario = {
      id: newId(),
      participanteId,
      eventoId,
      respostas,
      acertos,
      totalPerguntas,
      percentual,
      criadoEm: new Date().toISOString(),
    };

    const tentativas = loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []);
    saveCollection(TENTATIVAS_KEY, [...tentativas, tentativa]);
    return delay(tentativa);
  },

  async listarTentativas(eventoId, participanteId) {
    const tentativas = loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []);
    return delay(tentativas.filter((t) => t.eventoId === eventoId && t.participanteId === participanteId));
  },

  async listarTodasTentativas() {
    return delay(loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []));
  },
};

// http: perguntas e correcao vivem no backend, servidor nunca manda o gabarito antes do aluno responder
const httpQuestionarioService: QuestionarioService = {
  obterQuestionario(eventoId) {
    return api.get<PerguntaSemGabarito[]>(`/eventos/${eventoId}/questionario`);
  },
  enviarRespostas(eventoId, _participanteId, respostas) {
    return api.post<TentativaQuestionario>(`/eventos/${eventoId}/questionario/respostas`, { respostas });
  },
  listarTentativas(eventoId, _participanteId) {
    return api.get<TentativaQuestionario[]>(`/eventos/${eventoId}/questionario/tentativas`);
  },
  listarTodasTentativas() {
    return api.get<TentativaQuestionario[]>("/questionario-tentativas");
  },
};

export const questionarioService: QuestionarioService = USE_MOCK ? localQuestionarioService : httpQuestionarioService;
