import { z } from "zod";
import { REGEX_NOME } from "../../utils/validacao";

export const DOMINIO_EQUIPE = "@umc.br";

// conta da equipe criada na tela Equipe: so nome completo, e-mail institucional @umc.br (LGPD: nada alem disso) e
// o perfil (PROFESSOR, o padrao, ou SECRETARIA — esta so o administrador cria, conferido no service). O e-mail de
// aluno (@alunos.umc.br) nao serve: "x@alunos.umc.br" nao termina em "@umc.br"
export const contaEquipeSchema = z.object({
  nomeCompleto: z.string().trim().min(1, "Informe o nome completo.").regex(REGEX_NOME, "Nome deve conter apenas letras."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .refine((email) => email.endsWith(DOMINIO_EQUIPE), {
      message: `O e-mail precisa ser institucional (terminar com ${DOMINIO_EQUIPE}).`,
    }),
  perfil: z.enum(["PROFESSOR", "SECRETARIA"], { message: "Escolha o perfil: Professor ou Secretaria." }).optional(),
});
export type ContaEquipeInput = z.infer<typeof contaEquipeSchema>;

// filtro da lista da tela Equipe
export const filtroEquipeSchema = z.object({ perfil: z.enum(["PROFESSOR", "SECRETARIA"]).optional() });

// inativacao: motivo obrigatorio (visivel so pra equipe). "transferirPara" e obrigatorio quando o professor tem
// evento em aberto: "EQUIPE" (o evento fica sem professor, com a equipe) ou o id de outro professor ativo
export const inativacaoProfessorSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo da inativação.").max(500, "O motivo pode ter no máximo 500 caracteres."),
  transferirPara: z.union([z.literal("EQUIPE"), z.string().uuid("Professor de destino inválido.")]).optional(),
});
export type InativacaoProfessorInput = z.infer<typeof inativacaoProfessorSchema>;
