import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { salaParaDTO } from "../../utils/dto";
import { salasService } from "./salas.service";
import { salaSchema, salaUpdateSchema } from "./salas.schemas";

export const salasRouter = Router();

// Leitura é liberada pra qualquer perfil autenticado — o aluno não gerencia
// sala nenhuma, mas Agenda/listagem de eventos precisam mostrar o nome dela.
salasRouter.get(
  "/",
  autenticar,
  asyncHandler(async (_req, res) => {
    const salas = await salasService.listar();
    res.json(salas.map(salaParaDTO));
  }),
);

salasRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const sala = await salasService.buscarOuFalhar(req.params.id);
    res.json(salaParaDTO(sala));
  }),
);

// Daqui pra baixo, só admin/secretaria — aluno toma 403 em qualquer verbo de escrita.
salasRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(salaSchema),
  asyncHandler(async (req, res) => {
    const sala = await salasService.criar(req.body);
    res.status(201).json(salaParaDTO(sala));
  }),
);

salasRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(salaUpdateSchema),
  asyncHandler(async (req, res) => {
    const sala = await salasService.atualizar(req.params.id, req.body);
    res.json(salaParaDTO(sala));
  }),
);

salasRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await salasService.remover(req.params.id);
    res.status(204).send();
  }),
);
