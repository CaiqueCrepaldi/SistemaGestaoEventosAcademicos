import { Router } from "express";
import type { StatusPresenca } from "../../types/domain";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { inscricaoParaDTO } from "../../utils/dto";
import { inscricoesService } from "./inscricoes.service";
import { inscricaoCheckinSchema, inscricaoSchema } from "./inscricoes.schemas";

export const inscricoesRouter = Router();

// GET /api/inscricoes?eventoId=&participanteId=&status=, serve gestao e aluno junto
inscricoesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const participanteIdQuery = typeof req.query.participanteId === "string" ? req.query.participanteId : undefined;

    // ALUNO nunca consulta inscricao de outra pessoa, mesmo forjando o query param
    const participanteId = req.usuario!.perfil === "ALUNO" ? req.usuario!.participanteId ?? undefined : participanteIdQuery;

    const inscricoes = await inscricoesService.listar({
      eventoId: typeof req.query.eventoId === "string" ? req.query.eventoId : undefined,
      participanteId,
      status: typeof req.query.status === "string" ? (req.query.status as StatusPresenca) : undefined,
    });
    res.json(inscricoes.map(inscricaoParaDTO));
  }),
);

// inscricao manual, admin/secretaria escolhe o participante (aluno usa /eventos/{id}/inscricoes)
inscricoesRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(inscricaoSchema),
  asyncHandler(async (req, res) => {
    const inscricao = await inscricoesService.criarManual(req.body, { id: req.usuario!.sub, perfil: req.usuario!.perfil });
    res.status(201).json(inscricaoParaDTO(inscricao));
  }),
);

// mesma rota generica pra confirmar presenca ou marcar ausente
inscricoesRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(inscricaoCheckinSchema),
  asyncHandler(async (req, res) => {
    const inscricao = await inscricoesService.atualizarCheckin(req.params.id, req.body, req.usuario!.sub);
    res.json(inscricaoParaDTO(inscricao));
  }),
);

// a equipe cancela a inscricao de um aluno — mesma regra do cancelamento pelo proprio aluno (so
// presenca pendente em evento que nao comecou); o aluno e avisado por e-mail
inscricoesRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await inscricoesService.remover(req.params.id, { id: req.usuario!.sub, perfil: req.usuario!.perfil });
    res.status(204).send();
  }),
);
