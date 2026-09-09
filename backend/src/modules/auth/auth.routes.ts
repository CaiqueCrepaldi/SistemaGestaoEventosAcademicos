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

// cadastro de aluno
authRouter.post("/registro", validarCorpo(registroSchema), asyncHandler(authController.registrar));
// login
authRouter.post("/login", validarCorpo(loginSchema), asyncHandler(authController.login));
// pede o codigo de recuperacao de senha
authRouter.post(
  "/recuperacao-senha",
  validarCorpo(solicitarRecuperacaoSchema),
  asyncHandler(authController.solicitarRecuperacao),
);
// confirma o codigo e troca a senha
authRouter.post(
  "/recuperacao-senha/confirmar",
  validarCorpo(confirmarRecuperacaoSchema),
  asyncHandler(authController.confirmarRecuperacao),
);
