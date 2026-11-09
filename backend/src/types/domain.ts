// tipos das entidades, espelha as interfaces do frontend (frontend/src/types/index.ts)

export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO" | "PROFESSOR";
export type SituacaoAprovacao = "PENDENTE" | "APROVADO" | "RECUSADO";
// PENDENTE (sem pedido), SOLICITADO (aluno pediu o check-in), PRESENTE (aprovado), RECUSADO (recusado ou
// expirado sem decisao), AUSENTE (nao pediu ate a janela fechar)
export type StatusPresenca = "PENDENTE" | "SOLICITADO" | "PRESENTE" | "RECUSADO" | "AUSENTE";

export interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: Perfil;
  rgm: string | null;
  participanteId: string | null;
  consentimentoLgpdEm: string | null;
  versaoTermosAceitos: string | null;
  mfaAtivo: boolean;
  criadoEm: string;
}

export type TipoSolicitacaoTitular =
  | "ACESSO"
  | "CORRECAO"
  | "EXPORTACAO"
  | "EXCLUSAO"
  | "REVISAO_DECISAO_AUTOMATIZADA"
  | "OPOSICAO"
  | "OUTRO";
export type StatusSolicitacaoTitular = "ABERTA" | "EM_ANDAMENTO" | "ATENDIDA" | "NEGADA";

export interface SolicitacaoTitular {
  id: string;
  participanteId: string;
  tipo: TipoSolicitacaoTitular;
  status: StatusSolicitacaoTitular;
  descricao: string | null;
  resposta: string | null;
  atendidoPorId: string | null;
  criadoEm: string;
  atendidoEm: string | null;
}

export interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
  ativo: boolean;
  motivoInativacao: string | null;
  criadoEm: string;
}

// situacao da conta de acesso (Usuario ALUNO) vinculada ao participante — so o que a tela
// Participantes mostra. usuarioId nulo = participante sem conta (nao deveria existir, mas nao quebra)
export interface SituacaoConta {
  usuarioId: string | null;
  mfaAtivo: boolean;
  bloqueado: boolean;
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
  situacao: SituacaoAprovacao;
  motivoRecusa: string | null;
  // professor que criou; null = criado pela equipe
  criadoPorId: string | null;
  // proposta de alteracao aberta (pendente ou recusada) de nome/e-mail, quando o palestrante ja esta aprovado
  proposta?: PropostaPalestrante | null;
}

// proposta de alteracao (palestrante ou evento ja aprovado): os valores PROPOSTOS; os atuais estao no item
export interface PropostaPalestrante {
  id: string;
  situacao: SituacaoAprovacao;
  nome: string;
  email: string;
  motivoRecusa: string | null;
  criadoEm: string;
}

export interface PropostaEvento {
  id: string;
  situacao: SituacaoAprovacao;
  salaId: string;
  horario: string; // ISO-8601
  cargaHoraria: number;
  palestranteId: string;
  motivoRecusa: string | null;
  criadoEm: string;
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
  inscritos?: number; // contagem de inscricoes, preenchida nas consultas de leitura
  situacao: SituacaoAprovacao;
  motivoRecusa: string | null;
  // professor que criou; null = criado pela equipe
  criadoPorId: string | null;
  criadoEm: string;
  // ja existe tentativa de aluno: o questionario nao muda mais (QUESTIONARIO_TRAVADO)
  questionarioTravado?: boolean;
  // proposta de alteracao aberta (pendente ou recusada) de sala/horario/carga/palestrante
  proposta?: PropostaEvento | null;
}

export interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  // quando o aluno pediu o check-in
  checkinSolicitadoEm: string | null;
  // quando o pedido foi decidido e por quem (usuarioId)
  dataCheckin: string | null;
  usuarioId: string | null;
  dataInscricao: string;
}

// certificado emitido (gravado na primeira emissao): os dados impressos no PDF sao uma copia tirada
// naquele momento, nao mudam se o evento ou o cadastro do aluno forem editados depois
export interface Certificado {
  id: string;
  inscricaoId: string;
  eventoId: string;
  participanteId: string;
  codigoValidacao: string;
  nomeParticipante: string;
  rgm: string;
  tituloEvento: string;
  temaEvento: string;
  nomePalestrante: string;
  dataEvento: string; // ISO-8601
  cargaHoraria: number;
  emitidoEm: string; // ISO-8601
}

export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
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
