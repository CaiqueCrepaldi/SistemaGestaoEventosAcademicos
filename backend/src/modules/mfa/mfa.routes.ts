import { Router, type Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autenticarEtapaMfa, autenticarSessaoOuConfiguracaoMfa } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { mfaService } from "./mfa.service";
import { confirmarMfaSchema, desativarMfaSchema, verificarMfaSchema } from "./mfa.schemas";

export const mfaRouter = Router();

// quem esta configurando: aluno logado (req.usuario) ou equipe no meio do login (req.etapaMfa)
function usuarioConfigurando(req: Request): string {
  return req.usuario?.sub ?? req.etapaMfa!.usuarioId;
}

// segunda etapa do login: so aceita o token "2FA pendente" devolvido pelo /auth/login
mfaRouter.post(
  "/verificar",
  autenticarEtapaMfa("mfa_pendente"),
  validarCorpo(verificarMfaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.verificarLogin(req.etapaMfa!.usuarioId, req.body));
  }),
);

// gera (ou devolve o pendente) o segredo e o QR code
mfaRouter.post(
  "/configuracao",
  autenticarSessaoOuConfiguracaoMfa,
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.iniciarConfiguracao(usuarioConfigurando(req)));
  }),
);

// confirma com um codigo valido e ativa; devolve os codigos de recuperacao (uma unica vez)
mfaRouter.post(
  "/configuracao/confirmar",
  autenticarSessaoOuConfiguracaoMfa,
  validarCorpo(confirmarMfaSchema),
  asyncHandler(async (req, res) => {
    const resultado = await mfaService.confirmarConfiguracao(usuarioConfigurando(req), req.body.codigo, Boolean(req.etapaMfa));
    res.status(200).json(resultado);
  }),
);

// desativar (so ALUNO): senha + codigo atual, encerra as outras sessoes e devolve a sessao nova
mfaRouter.post(
  "/desativar",
  autenticar,
  validarCorpo(desativarMfaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.desativar(req.usuario!.sub, req.usuario!.perfil, req.body));
  }),
);
