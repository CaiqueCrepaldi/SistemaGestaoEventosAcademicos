import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { eventoParaDTO, inscricaoParaDTO, tentativaParaDTO } from "../../utils/dto";
import { AppError } from "../../errors/AppError";
import { questionarioService } from "../questionario/questionario.service";
import { respostasQuestionarioSchema } from "../questionario/questionario.schemas";
import { eventosService } from "./eventos.service";
import { eventoSchema, eventoUpdateSchema } from "./eventos.schemas";

export const eventosRouter = Router();

// Leitura liberada pra qualquer perfil autenticado — é a mesma rota usada
// tanto pela tela de gestão (admin/secretaria) quanto pela Agenda/listagem
// de eventos do aluno.
eventosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const eventos = await eventosService.listar();
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventos.map((e) => eventoParaDTO(e, paraAluno)));
  }),
);

eventosRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.id);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(eventoParaDTO(evento, paraAluno));
  }),
);

eventosRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.criar(req.body);
    // Quem cria é sempre admin/secretaria, então devolve com o gabarito.
    res.status(201).json(eventoParaDTO(evento, false));
  }),
);

eventosRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(eventoUpdateSchema),
  asyncHandler(async (req, res) => {
    const evento = await eventosService.atualizar(req.params.id, req.body);
    res.json(eventoParaDTO(evento, false));
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

// Perguntas do questionário desse evento, sem o gabarito — é o que o aluno
// carrega na tela de responder (o time de gestão já recebe o gabarito
// completo pela rota GET /:id acima).
eventosRouter.get(
  "/:eventoId/questionario",
  autenticar,
  asyncHandler(async (req, res) => {
    const evento = await eventosService.buscarOuFalhar(req.params.eventoId);
    res.json(eventoParaDTO(evento, true).questionario);
  }),
);

// Envio das respostas — só ALUNO, e sempre em nome do próprio participante
// do token (mesma proteção da autoinscrição acima: ninguém responde em
// nome de outra pessoa forjando participanteId no corpo).
eventosRouter.post(
  "/:eventoId/questionario/respostas",
  autenticar,
  autorizar("ALUNO"),
  validarCorpo(respostasQuestionarioSchema),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const tentativa = await questionarioService.responder(req.params.eventoId, participanteId, req.body);
    res.status(201).json(tentativaParaDTO(tentativa));
  }),
);

// Tentativas do PRÓPRIO aluno nesse evento — usado pra decidir se o botão
// de emitir certificado já pode ser liberado (ver certificadoService.ts no
// frontend).
eventosRouter.get(
  "/:eventoId/questionario/tentativas",
  autenticar,
  autorizar("ALUNO"),
  asyncHandler(async (req, res) => {
    const participanteId = req.usuario!.participanteId;
    if (!participanteId) {
      throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
    }
    const tentativas = await questionarioService.listarTentativas(req.params.eventoId, participanteId);
    res.json(tentativas.map(tentativaParaDTO));
  }),
);
