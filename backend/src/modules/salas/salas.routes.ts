import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { salaParaDTO } from "../../utils/dto";
import { salasService } from "./salas.service";

export const salasRouter = Router();

// lista todas as salas
salasRouter.get(
  "/",
  autenticar,
  asyncHandler(async (_req, res) => {
    const salas = await salasService.listar();
    res.json(salas.map(salaParaDTO));
  }),
);

// busca uma sala pelo id
salasRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const sala = await salasService.buscarOuFalhar(req.params.id);
    res.json(salaParaDTO(sala));
  }),
);
