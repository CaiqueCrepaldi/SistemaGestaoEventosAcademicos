import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes";
import { eventosRouter } from "./modules/eventos/eventos.routes";
import { salasRouter } from "./modules/salas/salas.routes";
import { palestrantesRouter } from "./modules/palestrantes/palestrantes.routes";
import { participantesRouter } from "./modules/participantes/participantes.routes";
import { inscricoesRouter } from "./modules/inscricoes/inscricoes.routes";
import { feedbacksRouter } from "./modules/feedbacks/feedbacks.routes";
import { questionarioRouter } from "./modules/questionario/questionario.routes";

export function criarApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  // fora do prefixo /api, healthcheck de infra nao precisa de token
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const apiRouter = express.Router();
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/usuarios", usuariosRouter);
  apiRouter.use("/eventos", eventosRouter);
  apiRouter.use("/salas", salasRouter);
  apiRouter.use("/palestrantes", palestrantesRouter);
  apiRouter.use("/participantes", participantesRouter);
  apiRouter.use("/inscricoes", inscricoesRouter);
  apiRouter.use("/feedbacks", feedbacksRouter);
  apiRouter.use("/questionario-tentativas", questionarioRouter);
  app.use("/api", apiRouter);

  app.use((req, res) => {
    res.status(404).json({
      timestamp: new Date().toISOString(),
      status: 404,
      code: "ROTA_NAO_ENCONTRADA",
      message: "Rota não encontrada.",
      path: req.originalUrl,
    });
  });

  app.use(errorHandler);

  return app;
}
