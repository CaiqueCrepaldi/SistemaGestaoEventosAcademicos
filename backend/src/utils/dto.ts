import type {
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  Sala,
  SolicitacaoTitular,
  TentativaQuestionario,
  Usuario,
} from "../types/domain";

// converte o registro interno pro formato de resposta da api
// separado do tipo interno pra nao vazar campo de controle (tipo criadoEm) sem querer

// dados do usuario do token, sem senhaHash
export function usuarioParaDTO(usuario: Usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    emailLogin: usuario.emailLogin,
    perfil: usuario.perfil,
    rgm: usuario.rgm,
    participanteId: usuario.participanteId,
    consentimentoLgpdEm: usuario.consentimentoLgpdEm,
    versaoTermosAceitos: usuario.versaoTermosAceitos,
  };
}

// solicitacao do titular tal como esta, sem campo de controle
export function solicitacaoParaDTO(solicitacao: SolicitacaoTitular & { participanteNome?: string }) {
  return {
    id: solicitacao.id,
    participanteId: solicitacao.participanteId,
    participanteNome: solicitacao.participanteNome,
    tipo: solicitacao.tipo,
    status: solicitacao.status,
    descricao: solicitacao.descricao,
    resposta: solicitacao.resposta,
    atendidoPorId: solicitacao.atendidoPorId,
    criadoEm: solicitacao.criadoEm,
    atendidoEm: solicitacao.atendidoEm,
  };
}

// sala tal como esta, sem campo de controle
export function salaParaDTO(sala: Sala) {
  return {
    id: sala.id,
    nome: sala.nome,
    capacidade: sala.capacidade,
  };
}

// paraAluno=true tira o e-mail da resposta (aluno nao precisa dele pra nada, ver docs/lgpd)
export function palestranteParaDTO(palestrante: Palestrante, paraAluno: boolean) {
  const base = { id: palestrante.id, nome: palestrante.nome };
  return paraAluno ? base : { ...base, email: palestrante.email };
}

// participante tal como esta, sem campo de controle
export function participanteParaDTO(participante: Participante) {
  return {
    id: participante.id,
    nome: participante.nome,
    email: participante.email,
    rgm: participante.rgm,
    ativo: participante.ativo,
    motivoInativacao: participante.motivoInativacao,
  };
}

// paraAluno=true tira o campo correta de cada alternativa, aluno nao ve gabarito antes de responder
export function eventoParaDTO(evento: Evento, paraAluno: boolean) {
  return {
    id: evento.id,
    titulo: evento.titulo,
    horario: evento.horario,
    salaId: evento.salaId,
    palestranteId: evento.palestranteId,
    tema: evento.tema,
    cargaHoraria: evento.cargaHoraria,
    questionario: paraAluno
      ? evento.questionario.map((p) => ({
          id: p.id,
          enunciado: p.enunciado,
          alternativas: p.alternativas.map((a) => ({ texto: a.texto })),
        }))
      : evento.questionario,
  };
}

// resultado de uma tentativa de questionario, tal como esta
export function tentativaParaDTO(tentativa: TentativaQuestionario) {
  return {
    id: tentativa.id,
    participanteId: tentativa.participanteId,
    eventoId: tentativa.eventoId,
    respostas: tentativa.respostas,
    acertos: tentativa.acertos,
    totalPerguntas: tentativa.totalPerguntas,
    percentual: tentativa.percentual,
    criadoEm: tentativa.criadoEm,
  };
}

// inscricao tal como esta, sem campo de controle
export function inscricaoParaDTO(inscricao: Inscricao) {
  return {
    id: inscricao.id,
    participanteId: inscricao.participanteId,
    eventoId: inscricao.eventoId,
    statusPresenca: inscricao.statusPresenca,
    dataCheckin: inscricao.dataCheckin,
    usuarioId: inscricao.usuarioId,
    dataInscricao: inscricao.dataInscricao,
  };
}

// feedback tal como esta, sem campo de controle
export function feedbackParaDTO(feedback: Feedback) {
  return {
    id: feedback.id,
    eventoId: feedback.eventoId,
    participanteId: feedback.participanteId,
    nota: feedback.nota,
    comentario: feedback.comentario,
  };
}
