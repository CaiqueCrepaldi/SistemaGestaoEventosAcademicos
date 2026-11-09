import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { expirarCheckinsAntes } from "../../utils/checkin";
import { dashboardService } from "./dashboard.service";

export const dashboardRouter = Router();

// equipe e professor (o mesmo service; para o professor, os numeros contam so os eventos dele). O aluno
// nao tem tela de dashboard
dashboardRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"));

// presentes/ausentes/aguardando dependem da presenca ja expirada nas janelas fechadas
dashboardRouter.use(expirarCheckinsAntes);

// indicadores, proximos eventos com ocupacao e presenca por evento, tudo agregado numa chamada so
dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await dashboardService.resumo({ id: req.usuario!.sub, perfil: req.usuario!.perfil }));
  }),
);
