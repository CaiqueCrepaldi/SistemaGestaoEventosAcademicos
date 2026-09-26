import { prisma } from "../db/prisma";
import { atingiuNotaMinima } from "./questionario";

// regra do certificado, a mesma da tela de Certificados: presenca confirmada no check-in
// E nota minima no questionario do evento (ver atingiuNotaMinima)

// ids dos eventos em que o participante ja tem direito ao certificado
export async function eventosComCertificado(participanteId: string): Promise<string[]> {
  const [presencas, tentativas] = await Promise.all([
    prisma.inscricao.findMany({ where: { participanteId, statusPresenca: "PRESENTE" }, select: { eventoId: true } }),
    prisma.tentativaQuestionario.findMany({ where: { participanteId }, select: { eventoId: true, percentual: true } }),
  ]);

  return presencas
    .map((inscricao) => inscricao.eventoId)
    .filter((eventoId) =>
      atingiuNotaMinima(tentativas.filter((tentativa) => tentativa.eventoId === eventoId).map((tentativa) => tentativa.percentual)),
    );
}

export async function temCertificado(participanteId: string, eventoId: string): Promise<boolean> {
  return (await eventosComCertificado(participanteId)).includes(eventoId);
}
