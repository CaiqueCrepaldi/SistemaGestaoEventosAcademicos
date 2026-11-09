import { Router, type Request } from "express";
import { eventosVisiveis } from "../../utils/escopo";
import { z } from "zod";
import type { StatusPresenca } from "../../types/domain";
import { buscaSchema, lerConsulta, paginacaoSchema } from "../../utils/paginacao";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { expirarCheckinsAntes } from "../../utils/checkin";
import { inscricaoParaDTO } from "../../utils/dto";
import { inscricoesService } from "./inscricoes.service";
import { inscricaoSchema } from "./inscricoes.schemas";

export const inscricoesRouter = Router();

function atorDe(req: Request) {
  return { id: req.usuario!.sub, perfil: req.usuario!.perfil, participanteId: req.usuario!.participanteId };
}

// GET /api/inscricoes?eventoId=&participanteId=&status=, serve gestao e aluno junto
inscricoesRouter.get(
  "/",
  autenticar,
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    const participanteIdQuery = typeof req.query.participanteId === "string" ? req.query.participanteId : undefined;

    // ALUNO nunca consulta inscricao de outra pessoa, mesmo forjando o query param
    const participanteId = req.usuario!.perfil === "ALUNO" ? req.usuario!.participanteId ?? undefined : participanteIdQuery;

    const inscricoes = await inscricoesService.listar({
      eventoId: typeof req.query.eventoId === "string" ? req.query.eventoId : undefined,
      participanteId,
      status: typeof req.query.status === "string" ? (req.query.status as StatusPresenca) : undefined,
      // o professor so ve as inscricoes dos eventos dele (o aluno ja fica preso ao proprio participante)
      escopoEvento: eventosVisiveis(atorDe(req)),
    });
    res.json(inscricoes.map(inscricaoParaDTO));
  }),
);

// GET /api/inscricoes/gestao?eventoId=&status=&busca=&page=&pageSize= — tela Inscricoes da equipe:
// paginada e filtrada no banco, com nome/RGM do aluno e titulo do evento ja junto
const consultaGestaoSchema = paginacaoSchema.extend({
  eventoId: z.string().trim().min(1).max(64).optional(),
  status: z.enum(["PENDENTE", "SOLICITADO", "PRESENTE", "RECUSADO", "AUSENTE"]).optional(),
  busca: buscaSchema,
});
inscricoesRouter.get(
  "/gestao",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    res.json(
      await inscricoesService.listarParaGestao({ ...lerConsulta(consultaGestaoSchema, req.query), escopoEvento: eventosVisiveis(atorDe(req)) }),
    );
  }),
);

// inscricao manual: equipe (qualquer evento) ou professor (so os dele) escolhe o participante (aluno usa
// /eventos/{id}/inscricoes)
inscricoesRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  validarCorpo(inscricaoSchema),
  asyncHandler(async (req, res) => {
    const inscricao = await inscricoesService.criarManual(req.body, atorDe(req));
    res.status(201).json(inscricaoParaDTO(inscricao));
  }),
);

// a presenca nao e mais marcada direto pela equipe (o antigo PUT /inscricoes/:id saiu): o aluno pede o
// check-in (POST /eventos/:eventoId/checkin) e quem cuida do evento decide (/api/checkin)

// a equipe cancela a inscricao de um aluno — mesma regra do cancelamento pelo proprio aluno (so
// presenca pendente em evento que nao comecou); o aluno e avisado por e-mail
inscricoesRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    await inscricoesService.remover(req.params.id, atorDe(req));
    res.status(204).send();
  }),
);
