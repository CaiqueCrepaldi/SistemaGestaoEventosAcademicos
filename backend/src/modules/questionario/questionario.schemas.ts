import { z } from "zod";

// Resposta do aluno: um índice de alternativa (0 a 3) por pergunta, na
// mesma ordem do questionário do evento — a correção roda inteira no
// servidor, contra Evento.questionario (o aluno nunca recebe o gabarito).
export const respostasQuestionarioSchema = z.object({
  respostas: z.array(z.number().int().min(0).max(3)).min(1, "Envie ao menos uma resposta."),
});
export type RespostasQuestionarioInput = z.infer<typeof respostasQuestionarioSchema>;
