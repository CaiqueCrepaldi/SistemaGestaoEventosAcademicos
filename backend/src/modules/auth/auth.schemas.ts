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

// chave do convite do professor (vem do link do e-mail). Sem formato rigido de proposito: chave errada
// cai no service e conta no limite de tentativas por IP
const conviteSchema = z.string().trim().min(1, "Convite inválido ou vencido.").max(200, "Convite inválido ou vencido.");

export const consultaConviteSchema = z.object({ convite: conviteSchema });
export type ConsultaConviteInput = z.infer<typeof consultaConviteSchema>;

// primeiro acesso do professor: a chave do convite, a senha nova (mesma regra do cadastro do aluno) e o
// aceite dos Termos de Uso/Politica de Privacidade (obrigatorio tambem na API)
export const primeiroAcessoSchema = z.object({
  convite: conviteSchema,
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

// troca de senha pelo proprio titular (Minha Conta), com a sessao aberta: senha atual + nova (mesma regra do
// cadastro) + confirmacao. Com o 2FA ativo vai junto o codigo do aplicativo OU um codigo de recuperacao (o
// service exige; aqui so o formato). Nova senha igual a atual e confirmacao diferente param aqui mesmo
export const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual.").max(200, "Senha atual ou código incorretos."),
    novaSenha: senhaNovaSchema,
    confirmacaoSenha: z.string().min(1, "Repita a nova senha."),
    codigo: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Informe os 6 dígitos do aplicativo autenticador.")
      .optional(),
    codigoRecuperacao: z.string().trim().min(1).max(20).optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.novaSenha !== dados.confirmacaoSenha) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmacaoSenha"], message: "As senhas não coincidem." });
    }
    if (dados.senhaAtual && dados.novaSenha === dados.senhaAtual) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["novaSenha"], message: "A nova senha precisa ser diferente da atual." });
    }
    if (dados.codigo && dados.codigoRecuperacao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codigo"],
        message: "Informe o código do aplicativo ou um código de recuperação, não os dois.",
      });
    }
  });
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;
