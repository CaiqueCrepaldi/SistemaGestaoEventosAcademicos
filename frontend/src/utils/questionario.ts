import type { PerguntaQuestionario } from "../types";

// regras fixas do questionario obrigatorio de cada evento
export const QUESTIONARIO_TAMANHO = 10;
export const ALTERNATIVAS_POR_PERGUNTA = 4;
export const PERCENTUAL_APROVACAO = 60;

export function perguntaVazia(): PerguntaQuestionario {
  return {
    id: crypto.randomUUID(),
    enunciado: "",
    alternativas: Array.from({ length: ALTERNATIVAS_POR_PERGUNTA }, () => ({ texto: "", correta: false })),
  };
}

export function questionarioVazio(): PerguntaQuestionario[] {
  return Array.from({ length: QUESTIONARIO_TAMANHO }, perguntaVazia);
}

// checa se as 10 perguntas tao completas, devolve o indice (1-based) da primeira com problema ou null
export function validarQuestionario(perguntas: PerguntaQuestionario[]): number | null {
  if (perguntas.length !== QUESTIONARIO_TAMANHO) return 1;
  for (let i = 0; i < perguntas.length; i++) {
    const pergunta = perguntas[i];
    if (!pergunta.enunciado.trim()) return i + 1;
    if (pergunta.alternativas.length !== ALTERNATIVAS_POR_PERGUNTA) return i + 1;
    if (pergunta.alternativas.some((a) => !a.texto.trim())) return i + 1;
    if (pergunta.alternativas.filter((a) => a.correta).length !== 1) return i + 1;
  }
  return null;
}

export function corrigirRespostas(
  perguntas: PerguntaQuestionario[],
  respostas: number[],
): { acertos: number; totalPerguntas: number; percentual: number } {
  const totalPerguntas = perguntas.length;
  const acertos = perguntas.reduce((total, pergunta, indice) => {
    const alternativaEscolhida = pergunta.alternativas[respostas[indice]];
    return alternativaEscolhida?.correta ? total + 1 : total;
  }, 0);
  const percentual = totalPerguntas > 0 ? Math.round((acertos / totalPerguntas) * 100) : 0;
  return { acertos, totalPerguntas, percentual };
}
