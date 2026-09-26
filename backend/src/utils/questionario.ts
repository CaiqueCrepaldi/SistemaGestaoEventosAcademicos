// regras fixas do questionario obrigatorio, espelha frontend/src/utils/questionario.ts
export const PERCENTUAL_APROVACAO = 60;
// aprovou uma vez, acabou — nao tem "refazer" depois disso, so as 2 tentativas totais
export const MAX_TENTATIVAS_QUESTIONARIO = 2;

// regra unica da nota minima: alguma tentativa chegou em PERCENTUAL_APROVACAO. Usada por quem
// decide se o aluno ja pode refazer o questionario e por quem decide se ele tem certificado
export function atingiuNotaMinima(percentuais: number[]): boolean {
  return percentuais.some((percentual) => percentual >= PERCENTUAL_APROVACAO);
}
