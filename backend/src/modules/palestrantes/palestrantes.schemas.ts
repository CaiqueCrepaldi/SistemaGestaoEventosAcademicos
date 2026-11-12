import { z } from "zod";
import { REGEX_NOME, normalizarEmail } from "../../utils/validacao";

// o e-mail do palestrante e unico so entre palestrantes (nao e login de ninguem), mas tambem e gravado
// normalizado (normalizarEmail), como os das contas
export const palestranteSchema = z.object({
  nome: z.string().trim().regex(REGEX_NOME, "Nome deve conter apenas letras."),
  email: z.string().trim().email("E-mail inválido.").transform(normalizarEmail),
});

export const palestranteUpdateSchema = palestranteSchema.partial();
export type PalestranteInput = z.infer<typeof palestranteSchema>;
export type PalestranteUpdateInput = z.infer<typeof palestranteUpdateSchema>;
// o professor corrige a proposta de nome/e-mail (pendente) ou reenvia a recusada, com resposta opcional
export const propostaPalestranteSchema = palestranteSchema
  .partial()
  .extend({ resposta: z.string().trim().max(1000, "A resposta pode ter no máximo 1000 caracteres.").optional() });
export type PropostaPalestranteInput = z.infer<typeof propostaPalestranteSchema>;
