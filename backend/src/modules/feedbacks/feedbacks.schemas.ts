import { z } from "zod";

// so o ALUNO envia feedback, em nome dele mesmo: participanteId vem sempre do token (ver feedbacks.routes.ts)
export const feedbackSchema = z.object({
  eventoId: z.string({ message: "Selecione a palestra." }).uuid("Selecione a palestra."),
  nota: z
    .number({ message: "Informe a nota." })
    .int("A nota deve ser um número inteiro.")
    .min(1, "A nota deve ser de 1 a 5.")
    .max(5, "A nota deve ser de 1 a 5."),
  comentario: z
    .string({ message: "Escreva um comentário." })
    .trim()
    .min(1, "Escreva um comentário.")
    .max(1000, "O comentário pode ter no máximo 1000 caracteres."),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

// a equipe so exclui feedback de aluno por um destes motivos. Lista fechada de proposito: o motivo
// vai pro log de auditoria (imutavel por 5 anos) e texto livre ali poderia carregar dado pessoal
export const MOTIVOS_EXCLUSAO_FEEDBACK = {
  CONTEUDO_OFENSIVO: "conteúdo ofensivo ou desrespeitoso",
  DADO_PESSOAL_EXPOSTO: "expõe dado pessoal de alguém",
  FORA_DO_TEMA: "fora do tema ou spam",
  PEDIDO_DO_ALUNO: "a pedido do próprio aluno",
} as const;
export type MotivoExclusaoFeedback = keyof typeof MOTIVOS_EXCLUSAO_FEEDBACK;

export const exclusaoPelaEquipeSchema = z.object({
  motivo: z.enum(Object.keys(MOTIVOS_EXCLUSAO_FEEDBACK) as [MotivoExclusaoFeedback, ...MotivoExclusaoFeedback[]], {
    message: "Selecione o motivo da exclusão.",
  }),
});
