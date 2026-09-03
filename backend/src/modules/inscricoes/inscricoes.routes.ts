import { Router } from "express";
import type { StatusPresenca } from "../../types/domain";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { inscricaoParaDTO } from "../../utils/dto";
import { inscricoesService } from "./inscricoes.service";
import { inscricaoCheckinSchema, inscricaoSchema } from "./inscricoes.schemas";

export const inscricoesRouter = Router();

// GET /api/inscricoes?eventoId=&participanteId=&status= — a mesma rota
// serve a tela de gestão (admin/secretaria, vê tudo) e o aluno (só as
// próprias inscrições). A distinção é feita aqui dentro, não em rotas
// separadas — ver docs/api-contract.md, seção Inscrições.
inscricoesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const participanteIdQuery = typeof req.query.participanteId === "string" ? req.query.participanteId : undefined;

    // Se for ALUNO, ignora QUALQUER participanteId vindo pela URL e força
    // o do próprio token — impede consultar inscrição de outra pessoa
    // simplesmente forjando o query param.
    const participanteId = req.usuario!.perfil === "ALUNO" ? req.usuario!.participanteId ?? undefined : participanteIdQuery;

    const inscricoes = await inscricoesService.listar({
      eventoId: typeof req.query.eventoId === "string" ? req.query.eventoId : undefined,
      participanteId,
      status: typeof req.query.status === "string" ? (req.query.status as StatusPresenca) : undefined,
    });
    res.json(inscricoes.map(inscricaoParaDTO));
  }),
);

// Inscrição manual — admin/secretaria escolhendo o participante (o aluno
// usa o endpoint dedicado em /eventos/{id}/inscricoes, que sempre usa o
// participanteId do próprio token).
inscricoesRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(inscricaoSchema),
  asyncHandler(async (req, res) => {
    const inscricao = await inscricoesService.criarManual(req.body);
    res.status(201).json(inscricaoParaDTO(inscricao));
  }),
);

// Patch de check-in (confirmar presença / marcar ausente) — é essa mesma
// rota genérica que a tela de Check-in usa, não existe /checkin/... à parte.
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

inscricoesRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await inscricoesService.remover(req.params.id);
    res.status(204).send();
  }),
);

// Endpoint dedicado chamado pelo frontend logo depois que a autoinscrição
// retorna 201 — qualquer perfil autenticado pode chamar, mas o service
// confere que a inscrição pertence a quem está chamando.
inscricoesRouter.post(
  "/:id/confirmacao-email",
  autenticar,
  asyncHandler(async (req, res) => {
    const resultado = await inscricoesService.confirmarEmail(req.params.id, req.usuario!.participanteId ?? "");
    res.status(200).json(resultado);
  }),
);
