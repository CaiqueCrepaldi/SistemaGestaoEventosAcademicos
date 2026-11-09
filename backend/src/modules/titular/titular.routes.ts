import { Router, type Request } from "express";
import { AppError } from "../../errors/AppError";
import { autenticar, autorizar } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { expirarCheckinsAntes } from "../../utils/checkin";
import { titularService } from "./titular.service";

export const titularRouter = Router();

// RF026: so o aluno, e sempre sobre ele mesmo (o participante vem do token, nunca da URL). A resposta
// tem dado pessoal: nem o navegador nem proxy no caminho guardam copia
titularRouter.use(autenticar, autorizar("ALUNO"), (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function participanteDoToken(req: Request): string {
  const participanteId = req.usuario!.participanteId;
  if (!participanteId) {
    throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
  }
  return participanteId;
}

// GET /api/meus-dados — tudo o que o sistema guarda sobre o aluno (acesso, art. 18, II)
titularRouter.get(
  "/",
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    res.json(await titularService.meusDados(participanteDoToken(req)));
  }),
);
