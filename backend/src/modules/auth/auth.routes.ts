import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { authController } from "./auth.controller";
import { professoresService } from "../professores/professores.service";
import { trocaSenhaService } from "./troca-senha.service";
import {
  alterarSenhaSchema,
  confirmarCadastroSchema,
  confirmarRecuperacaoSchema,
  loginSchema,
  consultaConviteSchema,
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
// primeiro acesso do professor (publicas), pelo link do convite: a tela consulta a chave (so diz se vale e o
// e-mail da conta, sem gastar o convite) e depois envia a chave + senha nova + aceite dos Termos. A chave vai
// no corpo (POST), nunca na URL, pra nao parar em log
authRouter.post(
  "/primeiro-acesso/convite",
  validarCorpo(consultaConviteSchema),
  asyncHandler(async (req, res) => {
    res.json(await professoresService.consultarConvite(req.body, req.ip ?? "desconhecido"));
  }),
);
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
// troca de senha pelo proprio titular (Minha Conta, qualquer perfil): o usuario vem do token. Encerra as
// outras sessoes e devolve a sessao nova de quem trocou
authRouter.post(
  "/alterar-senha",
  autenticar,
  validarCorpo(alterarSenhaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await trocaSenhaService.alterarSenha(req.usuario!.sub, req.body));
  }),
);
