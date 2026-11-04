import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar } from "../../middleware/auth";
import { AppError } from "../../errors/AppError";
import { certificadoParaDTO, certificadoPublicoParaDTO } from "../../utils/dto";
import { certificadosService } from "./certificados.service";

export const certificadosRouter = Router();

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

// GET /api/certificados?eventoId= — a equipe lista todos; o aluno so os proprios (sempre o
// participante do token, mesmo que mande outro filtro)
certificadosRouter.get(
  "/",
  autenticar,
  asyncHandler(async (req, res) => {
    const eventoId = typeof req.query.eventoId === "string" ? req.query.eventoId : undefined;
    let participanteId: string | undefined;
    if (req.usuario!.perfil === "ALUNO") {
      if (!req.usuario!.participanteId) {
        throw AppError.acessoNegado("Esta conta não está vinculada a um participante.");
      }
      participanteId = req.usuario!.participanteId;
    }
    const certificados = await certificadosService.listar({ eventoId, participanteId });
    res.json(certificados.map(certificadoParaDTO));
  }),
);

// RF018/RF019: emite o certificado da inscricao (201 na primeira vez) ou devolve o mesmo ja emitido
// (200). Aluno so a propria inscricao; administrador/secretaria qualquer uma que cumpra os requisitos
certificadosRouter.post(
  "/emitir/:inscricaoId",
  autenticar,
  asyncHandler(async (req, res) => {
    const { certificado, novo } = await certificadosService.emitir(req.params.inscricaoId, {
      id: req.usuario!.sub,
      perfil: req.usuario!.perfil,
      participanteId: req.usuario!.participanteId,
    });
    res.status(novo ? 201 : 200).json(certificadoParaDTO(certificado));
  }),
);
