import { z } from "zod";

// 4 alternativas por pergunta, exatamente 1 correta
const alternativaSchema = z.object({
  texto: z.string().trim().min(1, "Texto da alternativa é obrigatório."),
  correta: z.boolean(),
});

const perguntaSchema = z
  .object({
    id: z.string().trim().min(1),
    enunciado: z.string().trim().min(1, "Enunciado da pergunta é obrigatório."),
    alternativas: z.array(alternativaSchema).length(4, "Cada pergunta precisa ter exatamente 4 alternativas."),
  })
  .refine((pergunta) => pergunta.alternativas.filter((a) => a.correta).length === 1, {
    message: "Cada pergunta precisa ter exatamente 1 alternativa marcada como correta.",
    path: ["alternativas"],
  });

export const questionarioSchema = z.array(perguntaSchema).length(10, "O questionário precisa ter exatamente 10 perguntas.");

export const eventoSchema = z.object({
  titulo: z.string().trim().min(1, "Título é obrigatório."),
  horario: z.coerce.date({ message: "Horário inválido." }).transform((data) => data.toISOString()),
  salaId: z.string().uuid("salaId inválido."),
  palestranteId: z.string().uuid("Palestrante é obrigatório."),
  tema: z.string().trim().min(1, "Tema é obrigatório."),
  cargaHoraria: z.number().positive("Carga horária deve ser maior que zero."),
  questionario: questionarioSchema,
});
export type EventoInput = z.infer<typeof eventoSchema>;

export const eventoUpdateSchema = eventoSchema.partial();
export type EventoUpdateInput = z.infer<typeof eventoUpdateSchema>;
