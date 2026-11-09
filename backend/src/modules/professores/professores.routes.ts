import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { professoresService } from "./professores.service";
import { inativacaoProfessorSchema, professorSchema } from "./professores.schemas";

// tela Professores: so administrador e secretaria criam e acompanham as contas de professor
export const professoresRouter = Router();

professoresRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));

// nome, e-mail e situacao (aguardando primeiro acesso ou ativo)
professoresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await professoresService.listar());
  }),
);

// cria a conta (so nome e e-mail @umc.br) e envia o codigo do primeiro acesso
professoresRouter.post(
  "/",
  validarCorpo(professorSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await professoresService.criar(req.body, req.usuario!.sub));
  }),
);

// novo convite (link por e-mail), enquanto o professor nao fez o primeiro acesso; o anterior deixa de valer
professoresRouter.post(
  "/:id/reenviar-convite",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.reenviarConvite(req.params.id, req.usuario!.sub));
  }),
);

// eventos em aberto do professor (nao encerrados ou encerrados ha menos de 24 h): precisam de novo responsavel
// antes da inativacao
professoresRouter.get(
  "/:id/eventos-em-aberto",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.listarEventosEmAberto(req.params.id));
  }),
);

// inativa (motivo obrigatorio), transferindo os eventos em aberto para outro professor ativo ou para a equipe
professoresRouter.post(
  "/:id/inativar",
  validarCorpo(inativacaoProfessorSchema),
  asyncHandler(async (req, res) => {
    res.json(await professoresService.inativar(req.params.id, req.body, req.usuario!.sub));
  }),
);

// reativa a conta
professoresRouter.post(
  "/:id/reativar",
  asyncHandler(async (req, res) => {
    res.json(await professoresService.reativar(req.params.id, req.usuario!.sub));
  }),
);
