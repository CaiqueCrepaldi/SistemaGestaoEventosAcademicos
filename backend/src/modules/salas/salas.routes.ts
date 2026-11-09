import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { salaParaDTO } from "../../utils/dto";
import { ocupacaoPorSala } from "../../utils/ocupacao";
import { salasService } from "./salas.service";
import { salaSchema, salaUpdateSchema } from "./salas.schemas";

export const salasRouter = Router();

// lista todas as salas. Qualquer perfil logado le nome e capacidade (o aluno usa na tela Eventos);
// so a equipe recebe tambem a ocupacao real de cada sala (RF021: eventos encerrados e presentes /
// capacidade — utils/ocupacao.ts, a mesma conta do Dashboard)
salasRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const salas = await salasService.listar();
    const perfil = req.usuario!.perfil;
    if (perfil !== "ADMINISTRADOR" && perfil !== "SECRETARIA") {
      res.json(salas.map(salaParaDTO));
      return;
    }
    const ocupacao = await ocupacaoPorSala();
    res.json(
      salas.map((sala) => ({
        ...salaParaDTO(sala),
        eventosRealizados: ocupacao.get(sala.id)?.eventosRealizados ?? 0,
        ocupacaoMedia: ocupacao.get(sala.id)?.ocupacaoMedia ?? null,
      })),
    );
  }),
);

// busca uma sala pelo id
salasRouter.get(
  "/:id",
  autenticar,
  asyncHandler(async (req, res) => {
    const sala = await salasService.buscarOuFalhar(req.params.id);
    res.json(salaParaDTO(sala));
  }),
);

// daqui pra baixo so admin/secretaria
// cadastra uma sala nova
salasRouter.post(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(salaSchema),
  asyncHandler(async (req, res) => {
    const sala = await salasService.criar(req.body, req.usuario!.sub);
    res.status(201).json(salaParaDTO(sala));
  }),
);

// edita uma sala existente
salasRouter.put(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  validarCorpo(salaUpdateSchema),
  asyncHandler(async (req, res) => {
    const sala = await salasService.atualizar(req.params.id, req.body, req.usuario!.sub);
    res.json(salaParaDTO(sala));
  }),
);

// remove uma sala
salasRouter.delete(
  "/:id",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (req, res) => {
    await salasService.remover(req.params.id, req.usuario!.sub);
    res.status(204).send();
  }),
);
