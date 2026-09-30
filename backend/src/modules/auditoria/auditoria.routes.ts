import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { prisma } from "../../db/prisma";
import { lerDadoPessoal } from "../../utils/dadosPessoais";

export const auditoriaRouter = Router();

// so leitura, de proposito: a trilha eh imutavel, nao existe rota pra editar ou apagar log
auditoriaRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

// valor especial do filtro "responsavel" pra pegar so as acoes sem usuario (login falho, recuperacao de senha com e-mail inexistente)
const SEM_RESPONSAVEL = "sem-responsavel";

const consultaSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    acao: z.string().trim().min(1).max(60).optional(),
    usuarioId: z.string().trim().min(1).max(64).optional(),
    // instantes ISO (o frontend converte inicio/fim do dia no fuso do navegador), limites inclusivos
    de: z.string().datetime({ offset: true }).optional(),
    ate: z.string().datetime({ offset: true }).optional(),
  })
  .refine((q) => !q.de || !q.ate || new Date(q.de) <= new Date(q.ate), {
    message: "A data inicial não pode ser posterior à data final.",
    path: ["de"],
  });

// lista paginada, mais recente primeiro, com filtros aplicados no banco — nunca exibe dado
// sensivel, so o nome de quem agiu e o codigo/detalhe da acao.
// So leitura: nenhuma rota, service ou script apaga ou edita logs (TiDB nao tem trigger pra proteger)
auditoriaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const consulta = consultaSchema.safeParse(req.query);
    if (!consulta.success) {
      throw AppError.validacao(
        "Parâmetros de consulta inválidos.",
        consulta.error.issues.map((issue) => ({ campo: issue.path.join(".") || "(consulta)", mensagem: issue.message })),
      );
    }
    const { page, pageSize, acao, usuarioId, de, ate } = consulta.data;

    const where: Prisma.LogAuditoriaWhereInput = {
      acao,
      usuarioId: usuarioId === SEM_RESPONSAVEL ? null : usuarioId,
      criadoEm: de || ate ? { gte: de ? new Date(de) : undefined, lte: ate ? new Date(ate) : undefined } : undefined,
    };

    const [total, logs] = await prisma.$transaction([
      prisma.logAuditoria.count({ where }),
      prisma.logAuditoria.findMany({
        where,
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { usuario: true },
      }),
    ]);

    res.json({
      itens: logs.map((log) => {
        // copia do nome guardada no proprio log: atorNome (texto) ou, em log ainda nao convertido,
        // atorNomeCifrado (formato antigo)
        const copiaDoNome = log.atorNome ?? (log.atorNomeCifrado ? lerDadoPessoal(log.atorNomeCifrado) : null);
        return {
          id: log.id,
          acao: log.acao,
          detalhe: log.detalhe,
          criadoEm: log.criadoEm.toISOString(),
          usuarioId: log.usuarioId,
          // usuario existente: nome atual; usuario excluido: cai na copia guardada no proprio log
          atorNome: log.usuario ? lerDadoPessoal(log.usuario.nome) : copiaDoNome,
          // tinha responsavel na epoca, mas a conta nao existe mais
          atorRemovido: !log.usuario && Boolean(copiaDoNome),
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);

// quem ja aparece na trilha, pra montar o filtro por responsavel
auditoriaRouter.get(
  "/responsaveis",
  asyncHandler(async (_req, res) => {
    const grupos = await prisma.logAuditoria.groupBy({ by: ["usuarioId"], where: { usuarioId: { not: null } } });
    const ids = grupos.map((g) => g.usuarioId).filter((id): id is string => id !== null);
    const usuarios = await prisma.usuario.findMany({ where: { id: { in: ids } } });

    res.json(
      usuarios
        .map((u) => ({ id: u.id, nome: lerDadoPessoal(u.nome) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    );
  }),
);
