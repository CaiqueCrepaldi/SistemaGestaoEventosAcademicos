export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";

export interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: Perfil;
  rgm?: string | null; // só ALUNO
  telefone?: string | null; // só ALUNO
  participanteId?: string | null; // só ALUNO
}

export interface Evento {
  id: string;
  nome: string;
  data: string;
  local: string;
  descricao: string;
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

export interface Sessao {
  id: string;
  eventoId: string;
  titulo: string;
  horario: string;
  salaId: string;
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
  sessaoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;
  usuarioId: string | null;
}

export type StatusTrabalho = "PENDENTE" | "APROVADO" | "REJEITADO";

export interface Trabalho {
  id: string;
  titulo: string;
  resumo: string;
  arquivo: string;
  autorId: string;
  statusAvaliacao: StatusTrabalho;
}

export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
}
