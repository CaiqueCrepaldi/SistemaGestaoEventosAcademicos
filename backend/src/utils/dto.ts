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

// Funções puras que convertem o registro guardado internamente (que pode
// ter campos de controle, como criadoEm) no formato exato que
// docs/api-contract.md documenta pro JSON de resposta. Mantemos isso
// separado do tipo de armazenamento interno de propósito: por baixo pode
// mudar de "array em memória" pra um banco de verdade sem que isso vaze
// campo nenhum novo pra API por acidente.

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

// `paraAluno=true` remove o telefone inteiro da resposta (a chave nem
// aparece no JSON) — é a regra documentada pro perfil ALUNO nunca ver
// telefone de palestrante.
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

// `paraAluno=true` remove o campo `correta` de cada alternativa — o aluno
// não pode ver o gabarito antes de responder (ver módulo questionario, que
// usa a mesma regra pro endpoint dedicado de perguntas).
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
