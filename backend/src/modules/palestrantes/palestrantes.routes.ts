import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { palestranteParaDTO } from "../../utils/dto";
import { palestrantesService } from "./palestrantes.service";
import { palestranteSchema, palestranteUpdateSchema } from "./palestrantes.schemas";

export const palestrantesRouter = Router();

// Igual em Salas, leitura é liberada a qualquer perfil — mas aqui o DTO
// muda de formato dependendo de quem está perguntando: pro ALUNO, o campo
// telefone é removido do objeto (não fica null, a chave some de vez).
palestrantesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const palestrantes = await palestrantesService.listar();
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(palestrantes.map((p) => palestranteParaDTO(p, paraAluno)));
  }),
);

palestrantesRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.buscarOuFalhar(req.params.id);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(palestranteParaDTO(palestrante, paraAluno));
  }),
);

palestrantesRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(palestranteSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.criar(req.body);
    // Quem cria é sempre admin/secretaria, então devolve com telefone.
    res.status(201).json(palestranteParaDTO(palestrante, false));
  }),
);

palestrantesRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(palestranteUpdateSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.atualizar(req.params.id, req.body);
    res.json(palestranteParaDTO(palestrante, false));
  }),
);

palestrantesRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await palestrantesService.remover(req.params.id);
    res.status(204).send();
  }),
);
