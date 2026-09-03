export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";

export interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: Perfil;
  rgm?: string | null; // só ALUNO
  participanteId?: string | null; // só ALUNO
}

export interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}

export interface Palestrante {
  id: string;
  nome: string;
  curriculo: string;
  telefone: string;
}

export interface Evento {
  id: string;
  titulo: string;
  horario: string;
  salaId: string;
  palestranteId: string | null;
  tema: string;
  cargaHoraria: number;
  perguntas: string[]; // perguntas do questionário de feedback do evento
}

export interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}

export type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

export interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;
  usuarioId: string | null;
}

export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
}
