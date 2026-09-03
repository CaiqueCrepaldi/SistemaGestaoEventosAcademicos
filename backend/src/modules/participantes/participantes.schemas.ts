import { z } from "zod";
import { REGEX_NOME, REGEX_RGM, normalizarRgm } from "../../utils/validacao";

export const participanteSchema = z.object({
  nome: z.string().trim().regex(REGEX_NOME, "Nome deve conter apenas letras."),
  email: z.string().trim().email("E-mail inválido."),
  rgm: z
    .string()
    .trim()
    .transform(normalizarRgm)
    .refine((valor) => REGEX_RGM.test(valor), "RGM deve ter exatamente 11 caracteres, sem espaços."),
});
export type ParticipanteInput = z.infer<typeof participanteSchema>;

export const participanteUpdateSchema = participanteSchema.partial();
export type ParticipanteUpdateInput = z.infer<typeof participanteUpdateSchema>;
