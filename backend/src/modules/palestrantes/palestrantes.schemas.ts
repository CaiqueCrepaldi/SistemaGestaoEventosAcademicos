import { z } from "zod";

export const palestranteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  curriculo: z.string().trim().min(1, "Currículo é obrigatório."),
  telefone: z.string().trim().min(1, "Telefone é obrigatório."),
});
export type PalestranteInput = z.infer<typeof palestranteSchema>;

export const palestranteUpdateSchema = palestranteSchema.partial();
export type PalestranteUpdateInput = z.infer<typeof palestranteUpdateSchema>;
