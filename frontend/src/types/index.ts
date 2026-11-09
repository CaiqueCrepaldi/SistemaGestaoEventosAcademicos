// perfil de acesso do usuario logado, checado no ProtectedRoute/Layout/paginas
export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO" | "PROFESSOR";

// aprovacao de evento/palestrante criado por professor (o que a equipe cria ja nasce APROVADO)
export type SituacaoAprovacao = "PENDENTE" | "APROVADO" | "RECUSADO";

// os campos da aprovacao so vem pra equipe e pro professor dono (pro aluno so chega item aprovado)
export interface CamposAprovacao {
  situacao?: SituacaoAprovacao;
  motivoRecusa?: string | null;
  // professor que criou; null = criado pela equipe
  criadoPorId?: string | null;
}

// um passo do historico da aprovacao (envio, aprovacao, recusa com motivo, reenvio com resposta)
// os PROPOSTA_* sao da proposta de alteracao de um item ja aprovado; TRANSFERIDO, o evento passado para outro
// responsavel na inativacao do professor
export interface PassoAprovacao {
  acao:
    | "ENVIADO"
    | "APROVADO"
    | "RECUSADO"
    | "REENVIADO"
    | "PROPOSTA_ENVIADA"
    | "PROPOSTA_EDITADA"
    | "PROPOSTA_APROVADA"
    | "PROPOSTA_RECUSADA"
    | "PROPOSTA_REENVIADA"
    | "PROPOSTA_CANCELADA"
    | "TRANSFERIDO";
  mensagem: string | null;
  autorNome: string | null;
  criadoEm: string;
}

export interface Sala {
  id: string;
  nome: string;
  capacidade: number;
  // so na listagem da equipe (RF021): eventos encerrados na sala e a media de presentes / capacidade
  // neles, em %; null sem evento encerrado
  eventosRealizados?: number;
  ocupacaoMedia?: number | null;
}

// pessoa convidada pra ministrar um evento
// email so vem preenchido pra ADMINISTRADOR/SECRETARIA — pro ALUNO a chave nem aparece
// na resposta da API (minimizacao, ver docs/lgpd)
export interface Palestrante extends CamposAprovacao {
  id: string;
  nome: string;
  email?: string;
  // proposta de alteracao aberta (pendente ou recusada) de nome/e-mail — so pra equipe e pro professor dono
  proposta?: PropostaPalestrante | null;
}

// proposta de alteracao de um item ja aprovado: os valores PROPOSTOS (os atuais estao no proprio item)
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
  horario: string;
  cargaHoraria: number;
  palestranteId: string;
  motivoRecusa: string | null;
  criadoEm: string;
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
  situacao?: SituacaoAprovacao;
  motivoRecusa?: string | null;
  // professor que criou; null = criado pela equipe
  criadoPorId?: string | null;
  // ja ha tentativa de aluno: ninguem muda mais o questionario
  questionarioTravado?: boolean;
  // proposta de alteracao aberta (pendente ou recusada) de sala/horario/carga/palestrante
  proposta?: PropostaEvento | null;
  // so na resposta da edicao/aprovacao: a mudanca do professor virou proposta; quantos inscritos foram avisados
  propostaEnviada?: boolean;
  avisoInscritos?: { inscritos: number; avisados: number } | null;
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

// check-in pedido pelo aluno: PENDENTE (sem pedido) -> SOLICITADO (pediu) -> PRESENTE (aprovado) ou
// RECUSADO (recusado, ou expirado sem decisao). Quem nao pede ate a janela fechar fica AUSENTE
export type StatusPresenca = "PENDENTE" | "SOLICITADO" | "PRESENTE" | "RECUSADO" | "AUSENTE";

// vinculo entre um Participante e um Evento, certificado so libera com PRESENTE
export interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  // quando o aluno pediu o check-in
  checkinSolicitadoEm?: string | null;
  // quando o pedido foi decidido e por quem
  dataCheckin: string | null;
  usuarioId: string | null;
}

// uma pagina de uma lista paginada no servidor (inscricoes e certificados da equipe, auditoria)
export interface Pagina<T> {
  itens: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
  // so na listagem da equipe e do professor: nome do aluno e se ele esta ativo
  participanteNome?: string;
  participanteAtivo?: boolean;
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
