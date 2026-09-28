import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { mfaRouter } from "./modules/mfa/mfa.routes";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes";
import { eventosRouter } from "./modules/eventos/eventos.routes";
import { salasRouter } from "./modules/salas/salas.routes";
import { palestrantesRouter } from "./modules/palestrantes/palestrantes.routes";
import { participantesRouter } from "./modules/participantes/participantes.routes";
import { inscricoesRouter } from "./modules/inscricoes/inscricoes.routes";
import { feedbacksRouter } from "./modules/feedbacks/feedbacks.routes";
import { questionarioRouter } from "./modules/questionario/questionario.routes";
import { auditoriaRouter } from "./modules/auditoria/auditoria.routes";

// monta a instancia do express com todos os middlewares e rotas
export function criarApp() {
  const app = express();

  // atras do proxy da Vercel: sem isso, req.ip sempre devolveria o IP do proxy, nao o do
  // cliente de verdade — quebraria o bloqueio por IP (login/recuperacao de senha)
  app.set("trust proxy", 1);

  // cabecalhos de seguranca padrao (tambem remove o X-Powered-By, que expunha "Express")
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  // limite explicito (o maior payload legitimo hoje eh o questionario de 10 perguntas,
  // bem menor que isso) em vez de depender do padrao implicito do express.json()
  app.use(express.json({ limit: "256kb" }));

  // fora do prefixo /api, healthcheck de infra nao precisa de token
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const apiRouter = express.Router();
  apiRouter.use("/auth/2fa", mfaRouter);
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/usuarios", usuariosRouter);
  apiRouter.use("/eventos", eventosRouter);
  apiRouter.use("/salas", salasRouter);
  apiRouter.use("/palestrantes", palestrantesRouter);
  apiRouter.use("/participantes", participantesRouter);
  apiRouter.use("/inscricoes", inscricoesRouter);
  apiRouter.use("/feedbacks", feedbacksRouter);
  apiRouter.use("/questionario-tentativas", questionarioRouter);
  apiRouter.use("/logs-auditoria", auditoriaRouter);
  app.use("/api", apiRouter);

  // qualquer rota nao mapeada cai aqui, 404 no formato padrao
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
