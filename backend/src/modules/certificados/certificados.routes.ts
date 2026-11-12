import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { expirarCheckinsAntes } from "../../utils/checkin";
import { buscaSchema, lerConsulta, paginacaoSchema } from "../../utils/paginacao";
import { AppError } from "../../errors/AppError";
import { certificadoParaDTO, certificadoPublicoParaDTO } from "../../utils/dto";
import { eventosVisiveis } from "../../utils/escopo";
import { certificadosService } from "./certificados.service";

export const certificadosRouter = Router();

// certificados: o aluno (os proprios) e a equipe (todos). O professor nao ve certificado nenhum (403); a validacao
// publica pelo codigo, logo abaixo, continua aberta a qualquer pessoa
const SEM_PROFESSOR = ["ADMINISTRADOR", "SECRETARIA", "ALUNO"] as const;

// RF027: validacao PUBLICA (sem token) pelo codigo impresso no PDF. So devolve o necessario pra
// conferir o documento (nome, evento, data, carga horaria, emissao) — sem RGM nem e-mail.
// Limitada por IP (ver certificados.service.ts)
certificadosRouter.get(
  "/validar/:codigo",
  asyncHandler(async (req, res) => {
    const certificado = await certificadosService.validar(req.params.codigo, req.ip ?? "desconhecido");
    res.json(certificadoPublicoParaDTO(certificado));
  }),
);

// GET /api/certificados?eventoId= — a equipe lista todos; o aluno so os proprios (sempre o participante do token,
// mesmo que mande outro filtro); o professor recebe 403
certificadosRouter.get(
  "/",
  autenticar,
  autorizar(...SEM_PROFESSOR),
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    const eventoId = typeof req.query.eventoId === "string" ? req.query.eventoId : undefined;
    let participanteId: string | undefined;
    if (req.usuario!.perfil === "ALUNO") {
      if (!req.usuario!.participanteId) {
        throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
      }
      participanteId = req.usuario!.participanteId;
    }
    const certificados = await certificadosService.listar({
      eventoId,
      participanteId,
      escopoEvento: eventosVisiveis({ id: req.usuario!.sub, perfil: req.usuario!.perfil }),
    });
    res.json(certificados.map(certificadoParaDTO));
  }),
);

// GET /api/certificados/situacao?eventoId=&busca=&page=&pageSize= — tela Certificados da equipe: as
// inscricoes com presenca confirmada e a situacao do certificado de cada uma, paginadas no banco
const consultaSituacaoSchema = paginacaoSchema.extend({
  eventoId: z.string().trim().min(1).max(64).optional(),
  busca: buscaSchema,
});
certificadosRouter.get(
  "/situacao",
  autenticar,
  autorizar("ADMINISTRADOR", "SECRETARIA"),
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    res.json(
      await certificadosService.situacaoParaGestao({
        ...lerConsulta(consultaSituacaoSchema, req.query),
        escopoEvento: eventosVisiveis({ id: req.usuario!.sub, perfil: req.usuario!.perfil }),
      }),
    );
  }),
);

// RF018/RF019: emite o certificado da inscricao (201 na primeira vez) ou devolve o mesmo ja emitido
// (200). Aluno so a propria inscricao; administrador/secretaria qualquer uma que cumpra os requisitos; professor 403
certificadosRouter.post(
  "/emitir/:inscricaoId",
  autenticar,
  autorizar(...SEM_PROFESSOR),
  expirarCheckinsAntes,
  asyncHandler(async (req, res) => {
    const { certificado, novo } = await certificadosService.emitir(req.params.inscricaoId, {
      id: req.usuario!.sub,
      perfil: req.usuario!.perfil,
      participanteId: req.usuario!.participanteId,
    });
    res.status(novo ? 201 : 200).json(certificadoParaDTO(certificado));
  }),
);
