import { z } from "zod";
import { MENSAGEM_REGRA_SENHA, REGEX_NOME, REGEX_RGM, normalizarRgm, senhaAtendeRegras } from "../../utils/validacao";

const DOMINIO_INSTITUCIONAL = "@alunos.umc.br";

// toda senha NOVA (cadastro e recuperacao) segue a mesma regra — ver utils/validacao.ts
const senhaNovaSchema = z.string().refine(senhaAtendeRegras, MENSAGEM_REGRA_SENHA);

const emailInstitucionalSchema = z
  .string()
  .trim()
  .email("E-mail institucional inválido.")
  .toLowerCase()
  .refine((email) => email.endsWith(DOMINIO_INSTITUCIONAL), {
    message: `E-mail precisa ser institucional (terminar com ${DOMINIO_INSTITUCIONAL}).`,
  });

export const registroSchema = z.object({
  nomeCompleto: z.string().trim().regex(REGEX_NOME, "Nome deve conter apenas letras."),
  rgm: z
    .string()
    .trim()
    .transform(normalizarRgm)
    .refine((valor) => REGEX_RGM.test(valor), "RGM deve ter exatamente 11 dígitos, sem espaços."),
  emailInstitucional: emailInstitucionalSchema,
  senha: senhaNovaSchema,
  // esconder o checkbox no frontend nao e controle — o backend exige o aceite explicito (LGPD)
  aceiteLgpd: z.literal(true, {
    message: "É necessário aceitar os termos de uso e a política de privacidade.",
  }),
});
export type RegistroInput = z.infer<typeof registroSchema>;

// segunda etapa do cadastro: o codigo de 6 digitos que chegou no e-mail institucional
export const confirmarCadastroSchema = z.object({
  emailInstitucional: emailInstitucionalSchema,
  codigo: z.string().trim().regex(/^[0-9]{6}$/, "O código tem 6 dígitos."),
});
export type ConfirmarCadastroInput = z.infer<typeof confirmarCadastroSchema>;

export const reenviarCodigoCadastroSchema = z.object({
  emailInstitucional: emailInstitucionalSchema,
});
export type ReenviarCodigoCadastroInput = z.infer<typeof reenviarCodigoCadastroSchema>;

// primeiro acesso do professor: o codigo recebido por e-mail, a senha nova (mesma regra do cadastro do
// aluno) e o aceite dos Termos de Uso/Politica de Privacidade (obrigatorio tambem na API)
export const primeiroAcessoSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  codigo: z.string().trim().regex(/^[0-9]{6}$/, "O código tem 6 dígitos."),
  novaSenha: senhaNovaSchema,
  aceiteLgpd: z.literal(true, {
    message: "É necessário aceitar os termos de uso e a política de privacidade.",
  }),
});
export type PrimeiroAcessoInput = z.infer<typeof primeiroAcessoSchema>;

export const loginSchema = z.object({
  emailLogin: z.string().trim().min(1, "E-mail é obrigatório."),
  senha: z.string().min(1, "Senha é obrigatória."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const solicitarRecuperacaoSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
});
export type SolicitarRecuperacaoInput = z.infer<typeof solicitarRecuperacaoSchema>;

export const confirmarRecuperacaoSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  codigo: z.string().trim().min(1, "Código é obrigatório."),
  novaSenha: senhaNovaSchema,
});
export type ConfirmarRecuperacaoInput = z.infer<typeof confirmarRecuperacaoSchema>;
