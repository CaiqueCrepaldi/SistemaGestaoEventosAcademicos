import { z } from "zod";

// inscricao manual feita por admin/secretaria
export const inscricaoSchema = z.object({
  participanteId: z.string().uuid("participanteId inválido."),
  eventoId: z.string().uuid("eventoId inválido."),
});
export type InscricaoInput = z.infer<typeof inscricaoSchema>;
