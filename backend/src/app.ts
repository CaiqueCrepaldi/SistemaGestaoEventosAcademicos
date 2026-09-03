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

// Monta o app do Express: middlewares globais, todas as rotas sob /api
// (prefixo documentado em docs/api-contract.md) e por último o
// errorHandler, que precisa ser sempre o último `use()` da cadeia.
export function criarApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  // Fora do prefixo /api de propósito — é só pra ferramentas de infra
  // (load balancer, Docker healthcheck) confirmarem que o processo está de
  // pé, sem precisar de token nem seguir o formato de erro da API.
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
  app.use("/api", apiRouter);

  // Qualquer rota não mapeada acima cai aqui — devolve 404 no mesmo
  // formato de erro do resto da API, em vez do HTML padrão do Express.
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
