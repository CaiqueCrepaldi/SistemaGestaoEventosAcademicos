import { z } from "zod";
import { REGEX_NOME } from "../../utils/validacao";

export const DOMINIO_PROFESSOR = "@umc.br";

// conta de professor criada pela equipe: so nome completo e e-mail institucional @umc.br (LGPD: nada
// alem disso). O e-mail de aluno (@alunos.umc.br) nao serve: "x@alunos.umc.br" nao termina em "@umc.br"
export const professorSchema = z.object({
  nomeCompleto: z.string().trim().min(1, "Informe o nome completo.").regex(REGEX_NOME, "Nome deve conter apenas letras."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .refine((email) => email.endsWith(DOMINIO_PROFESSOR), {
      message: `O e-mail do professor precisa ser institucional (terminar com ${DOMINIO_PROFESSOR}).`,
    }),
});
export type ProfessorInput = z.infer<typeof professorSchema>;
