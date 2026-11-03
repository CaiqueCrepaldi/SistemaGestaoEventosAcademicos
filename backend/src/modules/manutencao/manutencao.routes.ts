import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { validarCorpo } from "../../middleware/validate";
import { conversaoService } from "./conversao.service";

// TEMPORARIO — rota de manutencao unica, sai na implantacao seguinte (ver conversao.service.ts)
export const manutencaoRouter = Router();

manutencaoRouter.use(autenticar, autorizar("ADMINISTRADOR"));

// sem corpo = simulacao (nao grava nada). Gravar exige os dois: aplicar e a confirmacao de que o
// backup das tabelas usuarios, participantes e logs_auditoria ja foi feito
const conversaoSchema = z
  .object({
    aplicar: z.boolean().optional().default(false),
    confirmoBackup: z.boolean().optional().default(false),
  })
  .refine((corpo) => !corpo.aplicar || corpo.confirmoBackup, {
    message: "Para gravar, confirme que o backup foi feito (confirmoBackup: true).",
    path: ["confirmoBackup"],
  });

manutencaoRouter.post(
  "/conversao-dados-pessoais",
  validarCorpo(conversaoSchema),
  asyncHandler(async (req, res) => {
    const { aplicar } = req.body as z.infer<typeof conversaoSchema>;
    res.json(await conversaoService.converter(aplicar, req.usuario!.sub));
  }),
);
