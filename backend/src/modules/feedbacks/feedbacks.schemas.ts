import { z } from "zod";

// participanteId opcional aqui: quando eh ALUNO criando, o valor vem do token (ver feedbacks.routes.ts)
export const feedbackSchema = z.object({
  eventoId: z.string().uuid("eventoId inválido."),
  participanteId: z.string().uuid("participanteId inválido.").optional(),
  nota: z.number().int().min(1, "Nota deve ser entre 1 e 5.").max(5, "Nota deve ser entre 1 e 5."),
  comentario: z.string().trim().min(1, "Comentário é obrigatório."),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackUpdateSchema = z.object({
  nota: z.number().int().min(1).max(5).optional(),
  comentario: z.string().trim().optional(),
});
export type FeedbackUpdateInput = z.infer<typeof feedbackUpdateSchema>;
