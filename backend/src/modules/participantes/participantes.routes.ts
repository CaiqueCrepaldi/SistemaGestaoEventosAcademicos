import { Router, type NextFunction, type Request, type Response } from "express";
import { AppError } from "../../errors/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { participanteComContaParaDTO, participanteParaDTO } from "../../utils/dto";
import { LIMITE_BUSCA_ALUNOS, LIMITE_MAXIMO_BUSCA_ALUNOS, participantesService } from "./participantes.service";
import { MENSAGEM_EMAIL_FIXO, participanteUpdateSchema } from "./participantes.schemas";

export const participantesRouter = Router();

// GET /participantes/alunos?busca=&limite= — busca alunos (conta ALUNO) por nome, e-mail ou RGM, em
// ordem alfabetica, no maximo `limite` (padrao 20, ate 50). Usada no check-in e na inscricao manual,
// que buscam enquanto se digita. Unica rota daqui aberta ao PROFESSOR (pra inscrever aluno nos eventos
// dele), sempre limitada a 20 resultados. Antes de "/:id" pra "alunos" nao virar id
participantesRouter.get(
  "/alunos",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"),
  asyncHandler(async (req, res) => {
    const busca = typeof req.query.busca === "string" ? req.query.busca : undefined;
    const limitePedido = Number(req.query.limite);
    const maximo = req.usuario!.perfil === "PROFESSOR" ? LIMITE_BUSCA_ALUNOS : LIMITE_MAXIMO_BUSCA_ALUNOS;
    const limite = Number.isInteger(limitePedido) && limitePedido > 0 ? Math.min(limitePedido, maximo) : LIMITE_BUSCA_ALUNOS;
    const alunos = await participantesService.listarAlunos(busca, limite);
    res.json(alunos.map(participanteParaDTO));
  }),
);

// o resto (listagem com 2FA e bloqueio, edicao, inativacao e remocao) so a equipe; nenhum verbo liberado
// pro ALUNO nem pro PROFESSOR
participantesRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA"));


// lista todos os participantes, com a situacao da conta (2FA e bloqueio) — admin e secretaria veem;
// resetar o 2FA e desbloquear continuam so pro ADMINISTRADOR (DELETE /usuarios/:id/2fa e /bloqueio)
participantesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const participantes = await participantesService.listar();
    res.json(participantes.map(participanteComContaParaDTO));
  }),
);


// busca um participante pelo id
participantesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const participante = await participantesService.buscarOuFalhar(req.params.id);
    res.json(participanteParaDTO(participante));
  }),
);

// o e-mail e o login do aluno, confirmado por codigo no cadastro: a equipe corrige nome e RGM, nunca o
// e-mail. Se o campo vier (mesmo igual ao atual), 422 — em vez de ser ignorado sem aviso
function recusarEmail(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object" && "email" in req.body) {
    throw AppError.validacao(MENSAGEM_EMAIL_FIXO, [{ campo: "email", mensagem: MENSAGEM_EMAIL_FIXO }]);
  }
  next();
}

participantesRouter.put(
  "/:id",
  recusarEmail,
  validarCorpo(participanteUpdateSchema),
  asyncHandler(async (req, res) => {
    const participante = await participantesService.atualizar(req.params.id, req.body, req.usuario!.sub);
    res.json(participanteParaDTO(participante));
  }),
);

participantesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await participantesService.remover(req.params.id, req.usuario!.sub);
    res.status(204).send();
  }),
);
