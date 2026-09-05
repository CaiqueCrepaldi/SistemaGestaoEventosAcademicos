import type {
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  Sala,
  TentativaQuestionario,
  Usuario,
} from "../types/domain";

// converte o registro interno pro formato de resposta da api
// separado do tipo interno pra nao vazar campo de controle (tipo criadoEm) sem querer

export function usuarioParaDTO(usuario: Usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    emailLogin: usuario.emailLogin,
    perfil: usuario.perfil,
    rgm: usuario.rgm,
    participanteId: usuario.participanteId,
  };
}

export function salaParaDTO(sala: Sala) {
  return {
    id: sala.id,
    nome: sala.nome,
    capacidade: sala.capacidade,
  };
}

// paraAluno=true tira o telefone da resposta
export function palestranteParaDTO(palestrante: Palestrante, paraAluno: boolean) {
  const base = { id: palestrante.id, nome: palestrante.nome, email: palestrante.email };
  return paraAluno ? base : { ...base, telefone: palestrante.telefone };
}

export function participanteParaDTO(participante: Participante) {
  return {
    id: participante.id,
    nome: participante.nome,
    email: participante.email,
    rgm: participante.rgm,
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

export function feedbackParaDTO(feedback: Feedback) {
  return {
    id: feedback.id,
    eventoId: feedback.eventoId,
    participanteId: feedback.participanteId,
    nota: feedback.nota,
    comentario: feedback.comentario,
  };
}
