import { z } from "zod";

// recusa de evento/palestrante: o motivo e obrigatorio (o professor precisa saber o que corrigir)
export const recusaSchema = z.object({
  motivo: z.string().trim().min(10, "Informe o motivo da recusa (mínimo de 10 caracteres).").max(1000, "O motivo pode ter no máximo 1000 caracteres."),
});
export type RecusaInput = z.infer<typeof recusaSchema>;

// reenvio pelo professor depois de corrigir: a resposta e opcional
export const reenvioSchema = z.object({
  resposta: z.string().trim().max(1000, "A resposta pode ter no máximo 1000 caracteres.").optional(),
});
export type ReenvioInput = z.infer<typeof reenvioSchema>;
