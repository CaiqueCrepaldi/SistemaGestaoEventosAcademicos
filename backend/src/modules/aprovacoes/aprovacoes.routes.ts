import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { aprovacoesService } from "./aprovacoes.service";

export const aprovacoesRouter = Router();

// GET /api/aprovacoes/contadores — contador do menu: equipe ve quantos eventos e palestrantes aguardam
// aprovacao; o professor, quantos dos dele foram recusados. So numeros
aprovacoesRouter.get(
  "/contadores",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    res.json(await aprovacoesService.contadores({ id: req.usuario!.sub, perfil: req.usuario!.perfil }));
  }),
);
