import type {
  Certificado,
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  Sala,
  SituacaoConta,
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
    mfaAtivo: usuario.mfaAtivo,
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
// "completo" = equipe, ou o professor que criou o palestrante: ve e-mail, situacao da aprovacao e o
// motivo da recusa. Os outros (aluno, outro professor) recebem so id e nome — o aluno so recebe
// palestrante aprovado (minimizacao, guia 4.3)
export function palestranteParaDTO(palestrante: Palestrante, completo: boolean) {
  const base = { id: palestrante.id, nome: palestrante.nome };
  return completo
    ? {
        ...base,
        email: palestrante.email,
        situacao: palestrante.situacao,
        motivoRecusa: palestrante.motivoRecusa,
        criadoPorId: palestrante.criadoPorId,
        proposta: palestrante.proposta ?? null,
      }
    : base;
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

// linha da tela Participantes: o participante + a situacao da conta dele. Lista campo a campo de
// proposito: segredo do 2FA, codigos de recuperacao e hash de senha nunca entram aqui
export function participanteComContaParaDTO(participante: Participante & SituacaoConta) {
  return {
    ...participanteParaDTO(participante),
    usuarioId: participante.usuarioId,
    mfaAtivo: participante.mfaAtivo,
    bloqueado: participante.bloqueado,
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
    inscritos: evento.inscritos,
    // situacao da aprovacao, motivo da ultima recusa e quem criou: so pra equipe e professor (pro aluno
    // so chega evento aprovado)
    // A proposta de alteracao aberta e a trava do questionario tambem (o aluno ve o evento como esta valendo)
    ...(paraAluno
      ? {}
      : {
          situacao: evento.situacao,
          motivoRecusa: evento.motivoRecusa,
          criadoPorId: evento.criadoPorId,
          questionarioTravado: evento.questionarioTravado ?? false,
          proposta: evento.proposta ?? null,
          ...(evento.checkinsPendentes !== undefined ? { checkinsPendentes: evento.checkinsPendentes } : {}),
        }),
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
    checkinSolicitadoEm: inscricao.checkinSolicitadoEm,
    dataCheckin: inscricao.dataCheckin,
    usuarioId: inscricao.usuarioId,
    dataInscricao: inscricao.dataInscricao,
  };
}

// certificado emitido com tudo que vai impresso no PDF — so pro dono (aluno) e pra equipe
export function certificadoParaDTO(certificado: Certificado) {
  return {
    id: certificado.id,
    inscricaoId: certificado.inscricaoId,
    eventoId: certificado.eventoId,
    participanteId: certificado.participanteId,
    codigoValidacao: certificado.codigoValidacao,
    nomeParticipante: certificado.nomeParticipante,
    rgm: certificado.rgm,
    tituloEvento: certificado.tituloEvento,
    temaEvento: certificado.temaEvento,
    nomePalestrante: certificado.nomePalestrante,
    dataEvento: certificado.dataEvento,
    cargaHoraria: certificado.cargaHoraria,
    emitidoEm: certificado.emitidoEm,
  };
}

// o que a validacao publica (sem login) devolve: o minimo pra conferir o documento impresso.
// Lista campo a campo de proposito — RGM, e-mail e ids internos nunca saem por aqui
export function certificadoPublicoParaDTO(certificado: Certificado) {
  return {
    nomeParticipante: certificado.nomeParticipante,
    tituloEvento: certificado.tituloEvento,
    dataEvento: certificado.dataEvento,
    cargaHoraria: certificado.cargaHoraria,
    emitidoEm: certificado.emitidoEm,
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
