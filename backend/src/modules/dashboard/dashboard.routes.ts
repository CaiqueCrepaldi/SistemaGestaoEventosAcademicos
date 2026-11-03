import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { dashboardService } from "./dashboard.service";

export const dashboardRouter = Router();

// so a equipe: o aluno nao tem tela de dashboard
dashboardRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

// indicadores, proximos eventos com ocupacao e presenca por evento, tudo agregado numa chamada so
dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await dashboardService.resumo());
  }),
);
