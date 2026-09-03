import { z } from "zod";

const DOMINIO_INSTITUCIONAL = "@aluno.ifsp.edu.br";

// Regras de validação de cada endpoint de autenticação. Ficam centralizadas
// aqui (em vez de espalhadas no controller) pra serem fáceis de achar e
// testar isoladamente. Mensagens em português, já que é o que a tela do
// frontend mostra direto pro usuário quando o erro é 422.
export const registroSchema = z.object({
  nomeCompleto: z.string().trim().min(1, "Nome completo é obrigatório."),
  rgm: z.string().regex(/^\d{8,}$/, "RGM deve conter só números, com no mínimo 8 dígitos."),
  emailInstitucional: z
    .string()
    .email("E-mail institucional inválido.")
    .toLowerCase()
    .refine((email) => email.endsWith(DOMINIO_INSTITUCIONAL), {
      message: `E-mail precisa ser institucional (terminar com ${DOMINIO_INSTITUCIONAL}).`,
    }),
  senha: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  emailLogin: z.string().trim().min(1, "E-mail é obrigatório."),
  senha: z.string().min(1, "Senha é obrigatória."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const solicitarRecuperacaoSchema = z.object({
  identificador: z.string().trim().min(1, "Informe e-mail ou RGM."),
});
export type SolicitarRecuperacaoInput = z.infer<typeof solicitarRecuperacaoSchema>;

export const confirmarRecuperacaoSchema = z.object({
  identificador: z.string().trim().min(1),
  codigo: z.string().trim().min(1, "Código é obrigatório."),
  novaSenha: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
});
export type ConfirmarRecuperacaoInput = z.infer<typeof confirmarRecuperacaoSchema>;
