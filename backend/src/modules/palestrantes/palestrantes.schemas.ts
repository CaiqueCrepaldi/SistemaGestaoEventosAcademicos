import { z } from "zod";
import { REGEX_NOME, REGEX_TELEFONE } from "../../utils/validacao";

export const palestranteSchema = z.object({
  nome: z.string().trim().regex(REGEX_NOME, "Nome deve conter apenas letras."),
  email: z.string().trim().email("E-mail inválido."),
  telefone: z.string().trim().regex(REGEX_TELEFONE, "Telefone deve estar no formato (00) 00000-0000."),
});
export type PalestranteInput = z.infer<typeof palestranteSchema>;

export const palestranteUpdateSchema = palestranteSchema.partial();
export type PalestranteUpdateInput = z.infer<typeof palestranteUpdateSchema>;
