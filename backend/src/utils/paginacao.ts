import { z, type ZodType } from "zod";
import { AppError } from "../errors/AppError";

// listas da equipe que podem crescer muito (inscricoes, situacao dos certificados) sao paginadas no
// servidor: a Vercel recusa resposta acima de 4,5 MB, e o teste de carga com 10 mil alunos mostrou a
// lista inteira de inscricoes passando de 8 MB. Mesmo formato da trilha de auditoria
export const TAMANHO_PAGINA_PADRAO = 50;
export const TAMANHO_PAGINA_MAXIMO = 100;

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(TAMANHO_PAGINA_MAXIMO).default(TAMANHO_PAGINA_PADRAO),
});

// texto livre de busca (nome, e-mail ou RGM do aluno): vazio vira "sem filtro"
export const buscaSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((valor) => valor || undefined);

export interface Pagina<T> {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function montarPagina<T>(itens: T[], total: number, page: number, pageSize: number): Pagina<T> {
  return { itens, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// valida a query string; parametro invalido vira 422 no formato padrao (campo + mensagem)
export function lerConsulta<T>(schema: ZodType<T, z.ZodTypeDef, unknown>, query: unknown): T {
  const consulta = schema.safeParse(query);
  if (!consulta.success) {
    throw AppError.validacao(
      "Parâmetros de consulta inválidos.",
      consulta.error.issues.map((issue) => ({ campo: issue.path.join(".") || "(consulta)", mensagem: issue.message })),
    );
  }
  return consulta.data;
}
