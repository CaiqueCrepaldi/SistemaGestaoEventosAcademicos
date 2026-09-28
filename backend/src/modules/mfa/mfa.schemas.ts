import { z } from "zod";

const codigoTotp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Informe os 6 dígitos do aplicativo autenticador.");

// segunda etapa do login: codigo do aplicativo OU um codigo de recuperacao, nunca os dois
export const verificarMfaSchema = z
  .object({
    codigo: codigoTotp.optional(),
    codigoRecuperacao: z.string().trim().min(1).max(20).optional(),
  })
  .refine((dados) => Boolean(dados.codigo) !== Boolean(dados.codigoRecuperacao), {
    message: "Informe o código do aplicativo ou um código de recuperação.",
  });
export type VerificarMfaInput = z.infer<typeof verificarMfaSchema>;

export const confirmarMfaSchema = z.object({ codigo: codigoTotp });
export type ConfirmarMfaInput = z.infer<typeof confirmarMfaSchema>;

export const desativarMfaSchema = z.object({
  senha: z.string().min(1, "Senha é obrigatória."),
  codigo: codigoTotp,
});
export type DesativarMfaInput = z.infer<typeof desativarMfaSchema>;
