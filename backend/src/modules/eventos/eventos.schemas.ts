import { z } from "zod";

export const eventoSchema = z.object({
  titulo: z.string().trim().min(1, "Título é obrigatório."),
  // z.coerce.date() aceita tanto uma string ISO-8601 (com ou sem offset)
  // quanto um timestamp e valida que é uma data de verdade; o .transform
  // devolve isso já como string ISO-8601, que é o formato guardado
  // internamente (ver types/domain.ts) e devolvido pela API.
  horario: z.coerce.date({ message: "Horário inválido." }).transform((data) => data.toISOString()),
  salaId: z.string().uuid("salaId inválido."),
  palestranteId: z.string().uuid("palestranteId inválido.").nullable().optional(),
  tema: z.string().trim().default(""),
  cargaHoraria: z.number().positive("Carga horária deve ser maior que zero."),
  perguntas: z.array(z.string().trim().min(1)).default([]),
});
export type EventoInput = z.infer<typeof eventoSchema>;

export const eventoUpdateSchema = eventoSchema.partial();
export type EventoUpdateInput = z.infer<typeof eventoUpdateSchema>;
