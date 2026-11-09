import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { authController } from "./auth.controller";
import { professoresService } from "../professores/professores.service";
import {
  confirmarCadastroSchema,
  confirmarRecuperacaoSchema,
  loginSchema,
  primeiroAcessoSchema,
  reenviarCodigoCadastroSchema,
  registroSchema,
  solicitarRecuperacaoSchema,
} from "./auth.schemas";

// unico modulo com rotas publicas, sem autenticar() - eh aqui que o token nasce
export const authRouter = Router();

// cadastro de aluno em 2 passos: os dados (manda o codigo pro e-mail institucional) e a confirmacao
// do codigo (cria a conta)
authRouter.post("/registro", validarCorpo(registroSchema), asyncHandler(authController.registrar));
authRouter.post("/registro/confirmar", validarCorpo(confirmarCadastroSchema), asyncHandler(authController.confirmarCadastro));
authRouter.post(
  "/registro/reenviar-codigo",
  validarCorpo(reenviarCodigoCadastroSchema),
  asyncHandler(authController.reenviarCodigoCadastro),
);
// primeiro acesso do professor (publica): codigo do e-mail + senha nova + aceite dos Termos
authRouter.post(
  "/primeiro-acesso",
  validarCorpo(primeiroAcessoSchema),
  asyncHandler(async (req, res) => {
    await professoresService.concluirPrimeiroAcesso(req.body, req.ip ?? "desconhecido");
    res.status(200).json({});
  }),
);
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
// registra o aceite da versao vigente dos termos/politica (reaceite quando a versao muda)
authRouter.post("/aceitar-termos", autenticar, asyncHandler(authController.aceitarTermos));
