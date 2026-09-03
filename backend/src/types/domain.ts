// Tipos das entidades do sistema — o "modelo de dados" da API, espelhando
// exatamente as interfaces do frontend (frontend/src/types/index.ts) e o
// contrato em docs/api-contract.md.
//
// Isso substitui os tipos que antes vinham gerados pelo Prisma
// (@prisma/client) depois que o banco de dados foi retirado deste projeto
// — o banco de dados é administrado à parte, em outra ferramenta; este
// backend guarda os dados em memória por enquanto (ver src/db/store.ts) e
// deve ganhar uma camada de acesso a um banco de verdade depois, sem
// precisar mudar nada fora de src/db/.

export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";
export type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

export interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
  criadoEm: string; // ISO-8601
}

export interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
  criadoEm: string;
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
  horario: string; // ISO-8601
  salaId: string;
  palestranteId: string | null;
  tema: string;
  cargaHoraria: number;
  perguntas: string[];
  criadoEm: string;
}

export interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;
  usuarioId: string | null;
  dataInscricao: string;
}

export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
  criadoEm: string;
}

export interface RecuperacaoSenha {
  id: string;
  usuarioId: string;
  codigo: string;
  expiraEm: string;
  usadoEm: string | null;
  criadoEm: string;
}
