import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { palestranteParaDTO } from "../../utils/dto";
import { palestrantesService } from "./palestrantes.service";
import { palestranteSchema, palestranteUpdateSchema } from "./palestrantes.schemas";

export const palestrantesRouter = Router();

// leitura liberada pra qualquer perfil (nome nao e dado sensivel, ver docs/lgpd), mas
// e-mail some da resposta pro ALUNO — ele nao precisa disso pra nada (minimizacao, guia 4.3)
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

palestrantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

palestrantesRouter.post(
  "/",
  validarCorpo(palestranteSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.criar(req.body, req.usuario!.sub);
    res.status(201).json(palestranteParaDTO(palestrante, false));
  }),
);

palestrantesRouter.put(
  "/:id",
  validarCorpo(palestranteUpdateSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.atualizar(req.params.id, req.body, req.usuario!.sub);
    res.json(palestranteParaDTO(palestrante, false));
  }),
);

palestrantesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await palestrantesService.remover(req.params.id, req.usuario!.sub);
    res.status(204).send();
  }),
);
