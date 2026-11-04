// perfil de acesso do usuario logado, checado no ProtectedRoute/Layout/paginas
export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";

export interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}

// pessoa convidada pra ministrar um evento
// email so vem preenchido pra ADMINISTRADOR/SECRETARIA — pro ALUNO a chave nem aparece
// na resposta da API (minimizacao, ver docs/lgpd)
export interface Palestrante {
  id: string;
  nome: string;
  email?: string;
}

// alternativa de resposta de uma pergunta do questionario, so uma por pergunta tem correta: true
export interface AlternativaQuestionario {
  texto: string;
  correta: boolean;
}

// pergunta de multipla escolha do questionario, sempre 4 alternativas
export interface PerguntaQuestionario {
  id: string;
  enunciado: string;
  alternativas: AlternativaQuestionario[];
}

// item principal do sistema, cada Evento tem sua propria sala/horario/palestrante
export interface Evento {
  id: string;
  titulo: string;
  horario: string;
  salaId: string;
  palestranteId: string;
  tema: string;
  cargaHoraria: number;
  // questionario obrigatorio definido pelo palestrante e cadastrado por admin/secretaria
  // sempre 10 perguntas, aluno precisa de 60% pra liberar o certificado
  questionario: PerguntaQuestionario[];
  // quantas inscricoes o evento tem (so vem nas consultas; o aluno nao enxerga as inscricoes dos outros)
  inscritos?: number;
}

// pessoa que participa de eventos, pode ou nao ter login
export interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
  ativo?: boolean;
  motivoInativacao?: string | null;
  // situacao da conta de acesso do aluno — so vem na listagem da tela Participantes (equipe)
  usuarioId?: string | null;
  mfaAtivo?: boolean;
  bloqueado?: boolean;
}

// comeca PENDENTE e so muda quando alguem da equipe confirma o checkin
export type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

// vinculo entre um Participante e um Evento, certificado so libera com PRESENTE
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

// respostas[i] = indice da alternativa escolhida na pergunta i (mesma ordem do questionario)
// pode ter mais de uma tentativa por participante/evento, elegibilidade de certificado usa a melhor
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
