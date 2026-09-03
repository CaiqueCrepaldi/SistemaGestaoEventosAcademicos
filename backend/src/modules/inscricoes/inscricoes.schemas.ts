import { z } from "zod";

// Inscrição manual feita por admin/secretaria (POST /api/inscricoes).
export const inscricaoSchema = z.object({
  participanteId: z.string().uuid("participanteId inválido."),
  eventoId: z.string().uuid("eventoId inválido."),
});
export type InscricaoInput = z.infer<typeof inscricaoSchema>;

// Patch de check-in (PUT /api/inscricoes/{id}). Só statusPresenca importa
// de verdade: o frontend também manda dataCheckin/usuarioId no corpo, mas
// o zod descarta qualquer campo fora deste schema (comportamento padrão de
// z.object) e o service sempre recalcula os dois por conta própria — ver
// comentário em inscricoes.service.ts explicando por quê.
export const inscricaoCheckinSchema = z.object({
  statusPresenca: z.enum(["PENDENTE", "PRESENTE", "AUSENTE"]),
});
export type InscricaoCheckinInput = z.infer<typeof inscricaoCheckinSchema>;
