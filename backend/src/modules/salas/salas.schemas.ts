import { z } from "zod";
import { MENSAGEM_CODIGO_SALA, normalizarCodigoSala, REGEX_CODIGO_SALA } from "../../utils/salas";

// o codigo da sala (padrao da UMC, ex.: 1T-01) vai no campo "nome"; a tela monta a partir de predio, andar e numero
export const salaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Escolha o prédio, o andar e o número da sala.")
    .transform(normalizarCodigoSala)
    .refine((codigo) => REGEX_CODIGO_SALA.test(codigo), MENSAGEM_CODIGO_SALA),
  tipo: z.enum(["SALA_DE_AULA", "LABORATORIO", "AUDITORIO"], { message: "Escolha o tipo da sala." }),
  capacidade: z.number().int().positive("Capacidade deve ser um número maior que zero."),
});
export type SalaInput = z.infer<typeof salaSchema>;

export const salaUpdateSchema = salaSchema.partial();
export type SalaUpdateInput = z.infer<typeof salaUpdateSchema>;
