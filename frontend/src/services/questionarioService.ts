import type { Evento, PerguntaQuestionario, TentativaQuestionario } from "../types";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO, corrigirRespostas } from "../utils/questionario";
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

// tira o campo `correta` de cada alternativa antes de mandar pro aluno
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
  // limpa as tentativas orfas quando o evento e apagado (no http o backend ja faz isso sozinho)
  removerTentativasDoEvento(eventoId: string): Promise<void>;
}

// busca o evento pelo id, estoura erro se nao existir
async function buscarEventoOuFalhar(eventoId: string): Promise<Evento> {
  const evento = await eventoService.get(eventoId);
  if (!evento) throw new ApiError(404, "Evento não encontrado.", "EVENTO_NAO_ENCONTRADO");
  return evento;
}

// mock guarda as tentativas numa colecao propria, fora do createCrudService generico
const localQuestionarioService: QuestionarioService = {
  // devolve as perguntas do evento sem o gabarito
  async obterQuestionario(eventoId) {
    const evento = await buscarEventoOuFalhar(eventoId);
    return delay(ocultarGabarito(evento.questionario));
  },

  // corrige contra o gabarito do evento e salva a tentativa
  // no maximo 2 tentativas por aluno/evento; aprovou uma vez, nao pode mais refazer
  async enviarRespostas(eventoId, participanteId, respostas) {
    const evento = await buscarEventoOuFalhar(eventoId);
    if (respostas.length !== evento.questionario.length || respostas.some((r) => r === undefined || r === null)) {
      throw new ApiError(422, "Responda todas as perguntas do questionário antes de enviar.", "RESPOSTAS_INCOMPLETAS");
    }

    const tentativas = loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []);
    const tentativasAnteriores = tentativas.filter((t) => t.eventoId === eventoId && t.participanteId === participanteId);
    const jaAprovado = tentativasAnteriores.some((t) => t.percentual >= PERCENTUAL_APROVACAO);
    if (jaAprovado) {
      throw new ApiError(409, "Você já atingiu a nota mínima neste questionário e não pode refazê-lo.", "QUESTIONARIO_JA_APROVADO");
    }
    if (tentativasAnteriores.length >= MAX_TENTATIVAS_QUESTIONARIO) {
      throw new ApiError(
        409,
        `Você já utilizou as ${MAX_TENTATIVAS_QUESTIONARIO} tentativas permitidas para este questionário.`,
        "LIMITE_TENTATIVAS_ATINGIDO",
      );
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

    saveCollection(TENTATIVAS_KEY, [...tentativas, tentativa]);
    return delay(tentativa);
  },

  // tentativas de um aluno especifico num evento especifico
  async listarTentativas(eventoId, participanteId) {
    const tentativas = loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []);
    return delay(tentativas.filter((t) => t.eventoId === eventoId && t.participanteId === participanteId));
  },

  // todas as tentativas de todo mundo, usado na tela de certificados da equipe
  async listarTodasTentativas() {
    return delay(loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []));
  },

  // mock nao tem fk, entao ao apagar um evento precisa limpar as tentativas dele na mao
  async removerTentativasDoEvento(eventoId) {
    const tentativas = loadCollection<TentativaQuestionario>(TENTATIVAS_KEY, []);
    saveCollection(TENTATIVAS_KEY, tentativas.filter((t) => t.eventoId !== eventoId));
    return delay(undefined);
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
  // backend ja cascade-deleta as tentativas junto com o evento, nao tem o que fazer aqui
  async removerTentativasDoEvento() {},
};

export const questionarioService: QuestionarioService = USE_MOCK ? localQuestionarioService : httpQuestionarioService;
