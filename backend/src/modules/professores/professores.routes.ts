import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { professoresService } from "./professores.service";
import { professorSchema } from "./professores.schemas";

// tela Professores: so administrador e secretaria criam e acompanham as contas de professor
export const professoresRouter = Router();

professoresRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

// nome, e-mail e situacao (aguardando primeiro acesso ou ativo)
professoresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await professoresService.listar());
  }),
);

// cria a conta (so nome e e-mail @umc.br) e envia o codigo do primeiro acesso
professoresRouter.post(
  "/",
  validarCorpo(professorSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await professoresService.criar(req.body, req.usuario!.sub));
  }),
);

// novo codigo, enquanto o professor nao fez o primeiro acesso
professoresRouter.post(
  "/:id/reenviar-codigo",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.reenviarCodigo(req.params.id, req.usuario!.sub));
  }),
);
