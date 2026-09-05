// tipos das entidades, espelha as interfaces do frontend (frontend/src/types/index.ts)

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
  criadoEm: string;
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
  email: string;
  telefone: string;
}

export interface AlternativaQuestionario {
  texto: string;
  correta: boolean;
}

export interface PerguntaQuestionario {
  id: string;
  enunciado: string;
  alternativas: AlternativaQuestionario[]; // sempre 4, so 1 correta
}

export interface Evento {
  id: string;
  titulo: string;
  horario: string; // ISO-8601
  salaId: string;
  palestranteId: string;
  tema: string;
  cargaHoraria: number;
  questionario: PerguntaQuestionario[]; // sempre 10 perguntas, minimo 60% pra liberar certificado
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

// respostas[i] = indice da alternativa escolhida na pergunta i (mesma ordem do questionario)
export interface TentativaQuestionario {
  id: string;
  participanteId: string;
  eventoId: string;
  respostas: number[];
  acertos: number;
  totalPerguntas: number;
  percentual: number;
  criadoEm: string;
}
