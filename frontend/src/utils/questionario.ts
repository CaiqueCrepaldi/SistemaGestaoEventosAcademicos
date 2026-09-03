import type { PerguntaQuestionario } from "../types";

// Regras fixas do questionário obrigatório de cada evento — usadas tanto no
// construtor de perguntas (EventosPage) quanto na correção (questionarioService).
export const QUESTIONARIO_TAMANHO = 10;
export const ALTERNATIVAS_POR_PERGUNTA = 4;
export const PERCENTUAL_APROVACAO = 60;

// Uma pergunta "vazia" pronta pra editar no formulário: 4 alternativas em
// branco, nenhuma marcada como correta ainda.
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

// Verifica se as 10 perguntas estão completas: enunciado preenchido, as 4
// alternativas preenchidas e exatamente uma marcada como correta. Devolve o
// índice (1-based, pra mensagem pro usuário) da primeira pergunta com
// problema, ou null se estiver tudo certo.
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

// Corrige uma lista de respostas (índice da alternativa escolhida por
// pergunta, na mesma ordem do questionário) e devolve o resultado pronto
// pra virar uma TentativaQuestionario.
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
