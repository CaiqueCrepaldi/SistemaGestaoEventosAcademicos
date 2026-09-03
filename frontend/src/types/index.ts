// Perfil de acesso do usuário logado. Define o que cada um pode ver/fazer
// (checado em ProtectedRoute, Layout e dentro de cada página).
export type Perfil = "ADMINISTRADOR" | "SECRETARIA" | "ALUNO";

// Conta de login. Todo ALUNO também tem um Participante vinculado
// (participanteId) — é por esse id que inscrição/check-in/certificado
// enxergam o aluno.
export interface Usuario {
  id: string;
  nome: string;
  emailLogin: string;
  senhaHash: string;
  perfil: Perfil;
  rgm?: string | null; // só ALUNO
  participanteId?: string | null; // só ALUNO
}

// Sala física onde um evento acontece. A capacidade é usada pra calcular
// vagas disponíveis na inscrição.
export interface Sala {
  id: string;
  nome: string;
  capacidade: number;
}

// Pessoa convidada pra ministrar um evento. O telefone não deve aparecer
// pro perfil ALUNO (ver PalestrantesPage.tsx e docs/api-contract.md).
export interface Palestrante {
  id: string;
  nome: string;
  email: string;
  telefone: string;
}

// Uma alternativa de resposta de uma pergunta do questionário obrigatório.
// Só uma alternativa por pergunta tem `correta: true`.
export interface AlternativaQuestionario {
  texto: string;
  correta: boolean;
}

// Uma pergunta de múltipla escolha do questionário do evento — sempre com
// exatamente 4 alternativas (ver PerguntaQuestionario/QUESTIONARIO_TAMANHO
// em utils/questionario.ts).
export interface PerguntaQuestionario {
  id: string;
  enunciado: string;
  alternativas: AlternativaQuestionario[];
}

// Uma palestra/minicurso/workshop — o item principal do sistema. Não existe
// mais um "evento guarda-chuva" agrupando vários desses; cada Evento é
// autossuficiente (tem sua própria sala, horário e palestrante).
export interface Evento {
  id: string;
  titulo: string;
  horario: string;
  salaId: string;
  palestranteId: string;
  tema: string;
  cargaHoraria: number;
  // Questionário obrigatório definido pelo palestrante (inserido no sistema
  // por administrador/secretaria) — sempre 10 perguntas de múltipla escolha.
  // O aluno só emite certificado depois de acertar pelo menos 60% dele.
  questionario: PerguntaQuestionario[];
}

// Pessoa que participa de eventos (pode ou não ter login — participante
// avulso cadastrado manualmente, ou aluno com conta).
export interface Participante {
  id: string;
  nome: string;
  email: string;
  rgm: string;
}

// Situação da presença de um inscrito: começa PENDENTE e só muda quando
// alguém da equipe confirma o check-in.
export type StatusPresenca = "PENDENTE" | "PRESENTE" | "AUSENTE";

// Vínculo entre um Participante e um Evento. O certificado só é liberado
// quando statusPresenca vira "PRESENTE".
export interface Inscricao {
  id: string;
  participanteId: string;
  eventoId: string;
  statusPresenca: StatusPresenca;
  dataCheckin: string | null;
  usuarioId: string | null;
}

// Avaliação (nota + comentário) que um participante deixa sobre um evento.
export interface Feedback {
  id: string;
  eventoId: string;
  participanteId: string;
  nota: number;
  comentario: string;
}

// Uma tentativa de um participante respondendo o questionário de um evento.
// `respostas[i]` é o índice da alternativa escolhida na pergunta i (mesma
// ordem de Evento.questionario). Pode haver mais de uma tentativa por par
// participante/evento — a elegibilidade de certificado usa a melhor.
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
