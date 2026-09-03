import { z } from "zod";

export const participanteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.string().email("E-mail inválido."),
  rgm: z.string().trim().min(1, "RGM é obrigatório."),
});
export type ParticipanteInput = z.infer<typeof participanteSchema>;

export const participanteUpdateSchema = participanteSchema.partial();
export type ParticipanteUpdateInput = z.infer<typeof participanteUpdateSchema>;
