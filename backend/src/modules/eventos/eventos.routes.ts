import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { eventoParaDTO, inscricaoParaDTO } from "../../utils/dto";
import { AppError } from "../../errors/AppError";
import { eventosService } from "./eventos.service";
import { eventoSchema, eventoUpdateSchema } from "./eventos.schemas";

export const eventosRouter = Router();

// Leitura liberada pra qualquer perfil autenticado — é a mesma rota usada
// tanto pela tela de gestão (admin/secretaria) quanto pela Agenda/listagem
// de eventos do aluno.
eventosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (_req, res) => {
    const eventos = await eventosService.listar();
    res.json(eventos.map(eventoParaDTO));
  }),
);

eventosRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.id);
    res.json(eventoParaDTO(evento));
  }),
);

eventosRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.criar(req.body);
    res.status(201).json(eventoParaDTO(evento));
  }),
);

eventosRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoUpdateSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.atualizar(req.params.id, req.body);
    res.json(eventoParaDTO(evento));
  }),
);

eventosRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await eventosService.remover(req.params.id);
    res.status(204).send();
  }),
);

// Autoinscrição — endpoint dedicado, só ALUNO. Ignora de propósito qualquer
// participanteId que viesse no corpo (nem aceita corpo: usa sempre o
// participanteId do PRÓPRIO token), pra impedir um aluno se inscrever em
// nome de outra pessoa forjando a requisição.
eventosRouter.post(
  "/:eventoId/inscricoes",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      // Defensivo: não deveria acontecer (todo ALUNO ganha um Participante
      // no cadastro), mas evita um erro 500 confuso se acontecer.
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const inscricao = await eventosService.autoinscrever(req.params.eventoId, participanteId);
    res.status(201).json(inscricaoParaDTO(inscricao));
  }),
);
