import { Router, type Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { autenticar, autorizar } from "../../middleware/auth";
import { expirarCheckinsAntes } from "../../utils/checkin";
import { inscricaoParaDTO } from "../../utils/dto";
import { checkinService } from "./checkin.service";

// decisao do check-in pedido pelo aluno: o professor dono do evento, a secretaria e o administrador.
// O pedido do aluno fica em POST /api/eventos/:eventoId/checkin (eventos.routes.ts). A expiracao das
// janelas fechadas roda antes de qualquer rota daqui
export const checkinRouter = Router();

checkinRouter.use(autenticar, autorizar("ADMINISTRADOR", "SECRETARIA", "PROFESSOR"), expirarCheckinsAntes);

function atorDe(req: Request) {
  return { id: req.usuario!.sub, perfil: req.usuario!.perfil };
}

// GET /api/checkin/eventos — eventos com a janela aberta que o perfil enxerga (professor: so os dele),
// com quantos pedidos esperam decisao
checkinRouter.get(
  "/eventos",
  asyncHandler(async (req, res) => {
    res.json(await checkinService.eventosComJanelaAberta(atorDe(req)));
  }),
);

// GET /api/checkin/eventos/:eventoId — painel "Check-ins" do evento (403 pro professor de outro evento)
checkinRouter.get(
  "/eventos/:eventoId",
  asyncHandler(async (req, res) => {
    res.json(await checkinService.painel(req.params.eventoId, atorDe(req)));
  }),
);

// POST /api/checkin/eventos/:eventoId/aprovar-todos — aprova so os pedidos SOLICITADO desse evento
checkinRouter.post(
  "/eventos/:eventoId/aprovar-todos",
  asyncHandler(async (req, res) => {
    res.json(await checkinService.aprovarTodos(req.params.eventoId, atorDe(req)));
  }),
);

// POST /api/checkin/inscricoes/:id/aprovar e /recusar — decide o pedido ou reverte a decisao
// (PRESENTE <-> RECUSADO) enquanto a janela esta aberta. Recusar nao pede motivo
checkinRouter.post(
  "/inscricoes/:id/aprovar",
  asyncHandler(async (req, res) => {
    res.json(inscricaoParaDTO(await checkinService.decidir(req.params.id, "APROVAR", atorDe(req))));
  }),
);
checkinRouter.post(
  "/inscricoes/:id/recusar",
  asyncHandler(async (req, res) => {
    res.json(inscricaoParaDTO(await checkinService.decidir(req.params.id, "RECUSAR", atorDe(req))));
  }),
);
