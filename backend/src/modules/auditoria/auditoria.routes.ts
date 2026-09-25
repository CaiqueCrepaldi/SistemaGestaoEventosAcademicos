import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { prisma } from "../../db/prisma";
import { descriptografar } from "../../utils/criptografia";

export const auditoriaRouter = Router();

const LIMITE_PADRAO = 200;

// lista os logs mais recentes primeiro, so admin/secretaria — nunca exibe dado sensivel,
// so o nome de quem agiu (decifrado) e o codigo/detalhe da acao
auditoriaRouter.get(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (_req, res) => {
    const logs = await prisma.logAuditoria.findMany({
      orderBy: { criadoEm: "desc" },
      take: LIMITE_PADRAO,
      include: { usuario: true },
    });

    res.json(
      logs.map((log) => ({
        id: log.id,
        acao: log.acao,
        detalhe: log.detalhe,
        criadoEm: log.criadoEm.toISOString(),
        atorNome: log.usuario ? descriptografar(log.usuario.nome) : null,
      })),
    );
  }),
);
