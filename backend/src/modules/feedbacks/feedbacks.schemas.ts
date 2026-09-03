import { z } from "zod";

// participanteId é opcional aqui de propósito: quando quem está criando é
// ALUNO, o valor é sempre sobrescrito pelo do token (ver feedbacks.routes.ts)
// e nem precisa vir no corpo; só admin/secretaria realmente usa esse campo,
// pra registrar feedback em nome de um participante qualquer.
export const feedbackSchema = z.object({
  eventoId: z.string().uuid("eventoId inválido."),
  participanteId: z.string().uuid("participanteId inválido.").optional(),
  nota: z.number().int().min(1, "Nota deve ser entre 1 e 5.").max(5, "Nota deve ser entre 1 e 5."),
  comentario: z.string().trim().default(""),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackUpdateSchema = z.object({
  nota: z.number().int().min(1).max(5).optional(),
  comentario: z.string().trim().optional(),
});
export type FeedbackUpdateInput = z.infer<typeof feedbackUpdateSchema>;
