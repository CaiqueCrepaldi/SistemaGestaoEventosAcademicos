import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { palestranteParaDTO } from "../../utils/dto";
import { palestrantesService } from "./palestrantes.service";
import { palestranteSchema, palestranteUpdateSchema } from "./palestrantes.schemas";

export const palestrantesRouter = Router();

// leitura liberada pra qualquer perfil (nome/e-mail nao sao dado sensivel, ver docs/lgpd)
palestrantesRouter.get(
  "/",
  autenticar,
  asyncHandler(async (_req, res) => {
    const palestrantes = await palestrantesService.listar();
    res.json(palestrantes.map(palestranteParaDTO));
  }),
);

// busca um palestrante pelo id
palestrantesRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.buscarOuFalhar(req.params.id);
    res.json(palestranteParaDTO(palestrante));
  }),
);

palestrantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

palestrantesRouter.post(
  "/",
  validarCorpo(palestranteSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.criar(req.body, req.usuario!.sub);
    res.status(201).json(palestranteParaDTO(palestrante));
  }),
);

palestrantesRouter.put(
  "/:id",
  validarCorpo(palestranteUpdateSchema),
  asyncHandler(async (req, res) => {
    const palestrante = await palestrantesService.atualizar(req.params.id, req.body, req.usuario!.sub);
    res.json(palestranteParaDTO(palestrante));
  }),
);

palestrantesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await palestrantesService.remover(req.params.id, req.usuario!.sub);
    res.status(204).send();
  }),
);
