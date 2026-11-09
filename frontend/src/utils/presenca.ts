import type { StatusPresenca } from "../types";

// mesma janela do backend (backend/src/utils/checkin.ts): abre 1 hora antes do inicio e fecha 24 horas
// depois do fim (horario + carga horaria). A tela so usa isto para mostrar ou esconder botoes; quem
// decide e a API, que responde 409 fora da janela
export const ANTECEDENCIA_CHECKIN_MS = 60 * 60 * 1000;
export const PRAZO_CHECKIN_APOS_FIM_MS = 24 * 60 * 60 * 1000;

export type SituacaoJanela = "ANTES" | "ABERTA" | "FECHADA";

export function janelaDoCheckin(evento: { horario: string; cargaHoraria: number }): { abre: Date; fecha: Date } {
  const inicio = new Date(evento.horario).getTime();
  const fim = inicio + evento.cargaHoraria * 3600 * 1000;
  return { abre: new Date(inicio - ANTECEDENCIA_CHECKIN_MS), fecha: new Date(fim + PRAZO_CHECKIN_APOS_FIM_MS) };
}

export function situacaoDaJanela(evento: { horario: string; cargaHoraria: number }, agora = Date.now()): SituacaoJanela {
  const { abre, fecha } = janelaDoCheckin(evento);
  if (agora < abre.getTime()) return "ANTES";
  return agora < fecha.getTime() ? "ABERTA" : "FECHADA";
}

export function dataHora(iso: string | Date): string {
  const data = typeof iso === "string" ? new Date(iso) : iso;
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// rotulo e cor da situacao da presenca nas telas da equipe e do professor
const ROTULO: Record<StatusPresenca, string> = {
  PENDENTE: "Pendente",
  SOLICITADO: "Check-in pedido",
  PRESENTE: "Presente",
  RECUSADO: "Recusado",
  AUSENTE: "Ausente",
};
const COR: Record<StatusPresenca, "neutral" | "green" | "red" | "orange"> = {
  PENDENTE: "neutral",
  SOLICITADO: "orange",
  PRESENTE: "green",
  RECUSADO: "red",
  AUSENTE: "red",
};

export function rotuloPresenca(status: StatusPresenca): string {
  return ROTULO[status];
}

export function corPresenca(status: StatusPresenca): "neutral" | "green" | "red" | "orange" {
  return COR[status];
}

// o mesmo, do ponto de vista do aluno (tela Eventos e Meus dados)
const ROTULO_ALUNO: Record<StatusPresenca, string> = {
  PENDENTE: "Check-in não realizado",
  SOLICITADO: "Aguardando aprovação do check-in",
  PRESENTE: "Presença confirmada",
  RECUSADO: "Check-in recusado",
  AUSENTE: "Ausente",
};

export function rotuloPresencaParaAluno(status: StatusPresenca): string {
  return ROTULO_ALUNO[status];
}
