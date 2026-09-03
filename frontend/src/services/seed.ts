import type {
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  Sala,
  Usuario,
} from "../types";

// Dados de demonstração de cada entidade. É o que aparece quando o site é
// aberto pela primeira vez (localStorage vazio) — ver loadCollection em
// storage.ts, que grava isso no navegador na primeira visita.

// Uma conta por perfil, pra dar pra testar os três fluxos direto na tela de login.
export const usuariosSeed: Usuario[] = [
  {
    id: "u1",
    nome: "Ana Ribeiro",
    emailLogin: "admin@ifsp.edu.br",
    senhaHash: "admin123",
    perfil: "ADMINISTRADOR",
  },
  {
    id: "u2",
    nome: "Carlos Souza",
    emailLogin: "secretaria@ifsp.edu.br",
    senhaHash: "secretaria123",
    perfil: "SECRETARIA",
  },
  {
    id: "u3",
    nome: "João Pedro Lima",
    emailLogin: "aluno@aluno.ifsp.edu.br",
    senhaHash: "aluno123",
    perfil: "ALUNO",
    rgm: "2024010011",
    participanteId: "pa1",
  },
];

export const salasSeed: Sala[] = [
  // nome + capacidade, usados no cálculo de vagas disponíveis
  { id: "s1", nome: "Auditório A", capacidade: 120 },
  { id: "s2", nome: "Sala 204", capacidade: 40 },
  { id: "s3", nome: "Laboratório de Informática 1", capacidade: 30 },
];

export const palestrantesSeed: Palestrante[] = [
  // telefone aqui é só pra demonstração — não deve ir pro perfil ALUNO
  {
    id: "p1",
    nome: "Dra. Mariana Costa",
    curriculo: "Doutora em Ciência da Computação, pesquisadora em Inteligência Artificial.",
    telefone: "(11) 98888-1111",
  },
  {
    id: "p2",
    nome: "Msc. Felipe Andrade",
    curriculo: "Mestre em Engenharia de Software, atua no mercado com arquitetura de sistemas.",
    telefone: "(11) 97777-2222",
  },
];

// Cada item já é o evento "final" (sem contêiner pai) — id prefixado "se"
// porque essa entidade nasceu da antiga "Sessão", fundida com Evento.
export const eventosSeed: Evento[] = [
  {
    id: "se1",
    titulo: "Abertura e Palestra Magna: IA na Educação",
    horario: "2026-09-14T09:00",
    salaId: "s1",
    palestranteId: "p1",
    tema: "Inteligência Artificial aplicada à Educação",
    cargaHoraria: 2,
    perguntas: [
      "O conteúdo apresentado atendeu suas expectativas?",
      "Você recomendaria este evento a outros alunos?",
    ],
  },
  {
    id: "se2",
    titulo: "Minicurso: Arquitetura de Microsserviços",
    horario: "2026-09-14T14:00",
    salaId: "s2",
    palestranteId: "p2",
    tema: "Arquitetura de Microsserviços na prática",
    cargaHoraria: 4,
    perguntas: ["O palestrante dominava o assunto apresentado?"],
  },
  {
    id: "se3",
    titulo: "Workshop Prático: React na Prática",
    horario: "2026-09-15T10:00",
    salaId: "s3",
    palestranteId: "p2",
    tema: "Desenvolvimento front-end com React",
    cargaHoraria: 4,
    perguntas: [],
  },
  {
    id: "se4",
    titulo: "Sessão de Apresentação de Pôsteres",
    horario: "2026-10-05T13:30",
    salaId: "s2",
    palestranteId: "p1",
    tema: "Iniciação Científica: pôsteres e resultados",
    cargaHoraria: 3,
    perguntas: [],
  },
];

// pa1 é o participante ligado ao usuário de demonstração do aluno (u3 acima)
export const participantesSeed: Participante[] = [
  { id: "pa1", nome: "João Pedro Lima", email: "joao.lima@aluno.ifsp.edu.br", rgm: "2024010011" },
  { id: "pa2", nome: "Beatriz Fernandes", email: "beatriz.fernandes@aluno.ifsp.edu.br", rgm: "2024010022" },
  { id: "pa3", nome: "Lucas Martins", email: "lucas.martins@aluno.ifsp.edu.br", rgm: "2023010033" },
];

// Já vem com uma presença confirmada (i1) e uma ausência (i4), pra dar pra
// testar a tela de Certificados sem precisar fazer check-in manual antes.
export const inscricoesSeed: Inscricao[] = [
  { id: "i1", participanteId: "pa1", eventoId: "se1", statusPresenca: "PRESENTE", dataCheckin: "2026-09-14T09:05", usuarioId: "u2" },
  { id: "i2", participanteId: "pa2", eventoId: "se1", statusPresenca: "PENDENTE", dataCheckin: null, usuarioId: null },
  { id: "i3", participanteId: "pa3", eventoId: "se2", statusPresenca: "PENDENTE", dataCheckin: null, usuarioId: null },
  { id: "i4", participanteId: "pa1", eventoId: "se2", statusPresenca: "AUSENTE", dataCheckin: null, usuarioId: null },
];

export const feedbacksSeed: Feedback[] = [
  // notas de 1 a 5, ambas pro mesmo evento (se1) pra já mostrar uma média na tela
  { id: "f1", eventoId: "se1", participanteId: "pa1", nota: 5, comentario: "Evento muito bem organizado, ótimas palestras." },
  { id: "f2", eventoId: "se1", participanteId: "pa2", nota: 4, comentario: "Gostei bastante, só achei o intervalo curto." },
];
