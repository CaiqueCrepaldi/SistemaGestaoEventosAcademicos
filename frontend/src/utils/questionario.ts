import type { PerguntaQuestionario } from "../types";

// regras fixas do questionario obrigatorio de cada evento
export const QUESTIONARIO_TAMANHO = 10;
export const ALTERNATIVAS_POR_PERGUNTA = 4;
export const PERCENTUAL_APROVACAO = 60;
// aprovou uma vez, acabou — nao tem "refazer" depois disso, so as 2 tentativas totais
export const MAX_TENTATIVAS_QUESTIONARIO = 2;

// uma pergunta em branco, 4 alternativas vazias, nenhuma marcada como correta
export function perguntaVazia(): PerguntaQuestionario {
  return {
    id: crypto.randomUUID(),
    enunciado: "",
    alternativas: Array.from({ length: ALTERNATIVAS_POR_PERGUNTA }, () => ({ texto: "", correta: false })),
  };
}

// as 10 perguntas em branco de um questionario novo
export function questionarioVazio(): PerguntaQuestionario[] {
  return Array.from({ length: QUESTIONARIO_TAMANHO }, perguntaVazia);
}
