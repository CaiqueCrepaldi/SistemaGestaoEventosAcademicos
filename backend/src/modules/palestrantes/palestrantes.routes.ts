import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { palestranteParaDTO } from "../../utils/dto";
import { palestrantesService } from "./palestrantes.service";

export const palestrantesRouter = Router();

// leitura liberada pra qualquer perfil, mas telefone some do DTO pro ALUNO
palestrantesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const palestrantes = await palestrantesService.listar();
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(palestrantes.map((p) => palestranteParaDTO(p, paraAluno)));
  }),
);

// busca um palestrante pelo id
palestrantesRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.buscarOuFalhar(req.params.id);
    const paraAluno = req.usuario!.perfil === "ALUNO";
    res.json(palestranteParaDTO(palestrante, paraAluno));
  }),
);
