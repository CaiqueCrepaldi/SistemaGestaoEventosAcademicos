import { z } from "zod";

// indice da alternativa escolhida (0 a 3) por pergunta, mesma ordem do questionario
// correcao roda no servidor, aluno nunca recebe o gabarito antes de enviar
export const respostasQuestionarioSchema = z.object({
  respostas: z.array(z.number().int().min(0).max(3)).min(1, "Envie ao menos uma resposta."),
});
export type RespostasQuestionarioInput = z.infer<typeof respostasQuestionarioSchema>;
