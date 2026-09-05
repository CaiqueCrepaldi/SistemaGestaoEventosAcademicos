import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { validarCorpo } from "../../middleware/validate";
import { authController } from "./auth.controller";
import {
  confirmarRecuperacaoSchema,
  loginSchema,
  registroSchema,
  solicitarRecuperacaoSchema,
} from "./auth.schemas";

// unico modulo com rotas publicas, sem autenticar() - eh aqui que o token nasce
export const authRouter = Router();

authRouter.post("/registro", validarCorpo(registroSchema), asyncHandler(authController.registrar));
authRouter.post("/login", validarCorpo(loginSchema), asyncHandler(authController.login));
authRouter.post(
  "/recuperacao-senha",
  validarCorpo(solicitarRecuperacaoSchema),
  asyncHandler(authController.solicitarRecuperacao),
);
authRouter.post(
  "/recuperacao-senha/confirmar",
  validarCorpo(confirmarRecuperacaoSchema),
  asyncHandler(authController.confirmarRecuperacao),
);
