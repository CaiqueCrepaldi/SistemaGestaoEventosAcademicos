import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { tentativaParaDTO } from "../../utils/dto";
import { questionarioService } from "./questionario.service";

// Endpoint "achatado" (fora de /eventos/:eventoId) usado só pela tela de
// Certificados da equipe, que precisa da nota do questionário de TODOS os
// alunos em TODOS os eventos de uma vez (as rotas aninhadas em
// eventos.routes.ts atendem o caso "minhas tentativas neste evento", que é
// o que o próprio aluno usa).
export const questionarioRouter = Router();

questionarioRouter.get(
  "/",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  asyncHandler(async (_req, res) => {
    const tentativas = await questionarioService.listarTodas();
    res.json(tentativas.map(tentativaParaDTO));
  }),
);
