import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autenticarEtapaMfa } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { mfaService } from "./mfa.service";
import { confirmarMfaSchema, desativarMfaSchema, verificarMfaSchema } from "./mfa.schemas";

// 2FA opcional pra qualquer perfil: cada um ativa e desativa o proprio em "Minha conta"
export const mfaRouter = Router();

// segunda etapa do login: so aceita o token "2FA pendente" devolvido pelo /auth/login
mfaRouter.post(
  "/verificar",
  autenticarEtapaMfa("mfa_pendente"),
  validarCorpo(verificarMfaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.verificarLogin(req.etapaMfa!.usuarioId, req.body));
  }),
);

// gera (ou devolve o pendente) o segredo e o QR code da propria conta
mfaRouter.post(
  "/configuracao",
  autenticar,
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.iniciarConfiguracao(req.usuario!.sub));
  }),
);

// confirma com um codigo valido e ativa; devolve os codigos de recuperacao (uma unica vez)
mfaRouter.post(
  "/configuracao/confirmar",
  autenticar,
  validarCorpo(confirmarMfaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.confirmarConfiguracao(req.usuario!.sub, req.body.codigo));
  }),
);

// desativar: senha + codigo atual, encerra as outras sessoes e devolve a sessao nova
mfaRouter.post(
  "/desativar",
  autenticar,
  validarCorpo(desativarMfaSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json(await mfaService.desativar(req.usuario!.sub, req.body));
  }),
);
