import { z } from "zod";

export const salaSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  capacidade: z.number().int().positive("Capacidade deve ser um número maior que zero."),
});
export type SalaInput = z.infer<typeof salaSchema>;

export const salaUpdateSchema = salaSchema.partial();
export type SalaUpdateInput = z.infer<typeof salaUpdateSchema>;
