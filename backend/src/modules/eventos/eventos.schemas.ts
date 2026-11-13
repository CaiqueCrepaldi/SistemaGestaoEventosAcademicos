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

// cancelamento pela equipe: motivo obrigatorio, de 10 a 500 caracteres (sem os espacos das pontas). Vai no e-mail
// aos inscritos e na tela; nunca na auditoria
export const cancelamentoEventoSchema = z.object({
  motivo: z
    .string({ required_error: "Informe o motivo do cancelamento.", invalid_type_error: "Informe o motivo do cancelamento." })
    .trim()
    .min(10, "O motivo precisa ter pelo menos 10 caracteres.")
    .max(500, "O motivo pode ter no máximo 500 caracteres."),
});
export type CancelamentoEventoInput = z.infer<typeof cancelamentoEventoSchema>;
export type EventoUpdateInput = z.infer<typeof eventoUpdateSchema>;

// o professor corrige a proposta de alteracao (pendente) ou a reenvia depois de recusada, com uma resposta
// opcional. Campo que nao vier fica como estava na proposta
export const propostaEventoSchema = eventoSchema
  .pick({ salaId: true, horario: true, cargaHoraria: true, palestranteId: true })
  .partial()
  .extend({ resposta: z.string().trim().max(1000, "A resposta pode ter no máximo 1000 caracteres.").optional() });
export type PropostaEventoInput = z.infer<typeof propostaEventoSchema>;

const SITUACOES = ["PENDENTE", "APROVADO", "RECUSADO"] as const;

// calendario da equipe e do professor: os eventos que comecam em [de, ate). O mes na tela com as semanas de
// borda da no maximo 42 dias; 62 da folga sem deixar alguem baixar a base inteira de uma vez
export const INTERVALO_MAXIMO_DIAS = 62;
export const intervaloEventosSchema = z
  .object({
    de: z.coerce.date({ invalid_type_error: "Data inicial inválida." }),
    ate: z.coerce.date({ invalid_type_error: "Data final inválida." }),
    situacao: z.enum(SITUACOES).optional(),
  })
  .refine((c) => c.ate.getTime() > c.de.getTime(), { message: "A data final precisa ser depois da inicial.", path: ["ate"] })
  .refine((c) => c.ate.getTime() - c.de.getTime() <= INTERVALO_MAXIMO_DIAS * 24 * 3600 * 1000, {
    message: `O intervalo pode ter no máximo ${INTERVALO_MAXIMO_DIAS} dias.`,
    path: ["ate"],
  });
export type IntervaloEventos = z.infer<typeof intervaloEventosSchema>;

// busca do calendario (titulo, tema, palestrante ou sala) e o filtro de situacao, no servidor e com limite
export const LIMITE_BUSCA_EVENTOS_PADRAO = 20;
export const LIMITE_BUSCA_EVENTOS_MAXIMO = 50;
export const buscaEventosSchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(100, "A busca pode ter no máximo 100 caracteres.")
      .optional()
      .transform((valor) => valor || undefined),
    situacao: z.enum(SITUACOES).optional(),
    limite: z.coerce.number().int().min(1).max(LIMITE_BUSCA_EVENTOS_MAXIMO).default(LIMITE_BUSCA_EVENTOS_PADRAO),
  })
  .refine((c) => c.q || c.situacao, { message: "Informe o texto da busca ou a situação.", path: ["q"] });
export type BuscaEventos = z.infer<typeof buscaEventosSchema>;
