import { z } from "zod";
import { REGEX_NOME, REGEX_RGM, normalizarRgm } from "../../utils/validacao";

export const MENSAGEM_EMAIL_FIXO = "O e-mail não pode ser alterado.";

// o que a equipe pode corrigir no aluno: nome, RGM e a situacao. O e-mail NAO entra: e o login do
// aluno, confirmado por codigo no cadastro (ver participantes.routes.ts, que recusa o campo com 422)
export const participanteUpdateSchema = z
  .object({
    nome: z.string().trim().regex(REGEX_NOME, "Nome deve conter apenas letras."),
    rgm: z
      .string()
      .trim()
      .transform(normalizarRgm)
      .refine((valor) => REGEX_RGM.test(valor), "RGM deve ter exatamente 11 dígitos, sem espaços."),
    ativo: z.boolean(),
    motivoInativacao: z.string().trim().max(500).nullable(),
  })
  .partial();
export type ParticipanteUpdateInput = z.infer<typeof participanteUpdateSchema>;
