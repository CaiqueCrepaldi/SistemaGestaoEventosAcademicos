import type {
  Evento,
  Feedback,
  Inscricao,
  Palestrante,
  Participante,
  Sala,
  Sessao,
  Trabalho,
  Usuario,
} from "../types";

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

export const eventosSeed: Evento[] = [
  {
    id: "e1",
    nome: "Semana Acadêmica de Tecnologia 2026",
    data: "2026-09-14",
    local: "Campus Central",
    descricao: "Evento anual com palestras, minicursos e apresentação de trabalhos dos cursos de tecnologia.",
  },
  {
    id: "e2",
    nome: "Congresso de Iniciação Científica 2026",
    data: "2026-10-05",
    local: "Auditório Principal",
    descricao: "Apresentação de pesquisas e projetos de iniciação científica dos alunos.",
  },
];

export const salasSeed: Sala[] = [
  { id: "s1", nome: "Auditório A", capacidade: 120 },
  { id: "s2", nome: "Sala 204", capacidade: 40 },
  { id: "s3", nome: "Laboratório de Informática 1", capacidade: 30 },
];

export const palestrantesSeed: Palestrante[] = [
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

export const sessoesSeed: Sessao[] = [
  {
    id: "se1",
    eventoId: "e1",
    titulo: "Abertura e Palestra Magna: IA na Educação",
    horario: "2026-09-14T09:00",
    salaId: "s1",
    palestranteId: "p1",
    tema: "Inteligência Artificial aplicada à Educação",
  },
  {
    id: "se2",
    eventoId: "e1",
    titulo: "Minicurso: Arquitetura de Microsserviços",
    horario: "2026-09-14T14:00",
    salaId: "s2",
    palestranteId: "p2",
    tema: "Arquitetura de Microsserviços na prática",
  },
  {
    id: "se3",
    eventoId: "e1",
    titulo: "Workshop Prático: React na Prática",
    horario: "2026-09-15T10:00",
    salaId: "s3",
    palestranteId: "p2",
    tema: "Desenvolvimento front-end com React",
  },
  {
    id: "se4",
    eventoId: "e2",
    titulo: "Sessão de Apresentação de Pôsteres",
    horario: "2026-10-05T13:30",
    salaId: "s2",
    palestranteId: "p1",
    tema: "Iniciação Científica: pôsteres e resultados",
  },
];

export const participantesSeed: Participante[] = [
  { id: "pa1", nome: "João Pedro Lima", email: "joao.lima@aluno.ifsp.edu.br", rgm: "2024010011" },
  { id: "pa2", nome: "Beatriz Fernandes", email: "beatriz.fernandes@aluno.ifsp.edu.br", rgm: "2024010022" },
  { id: "pa3", nome: "Lucas Martins", email: "lucas.martins@aluno.ifsp.edu.br", rgm: "2023010033" },
];

export const inscricoesSeed: Inscricao[] = [
  { id: "i1", participanteId: "pa1", sessaoId: "se1", statusPresenca: "PRESENTE", dataCheckin: "2026-09-14T09:05", usuarioId: "u2" },
  { id: "i2", participanteId: "pa2", sessaoId: "se1", statusPresenca: "PENDENTE", dataCheckin: null, usuarioId: null },
  { id: "i3", participanteId: "pa3", sessaoId: "se2", statusPresenca: "PENDENTE", dataCheckin: null, usuarioId: null },
  { id: "i4", participanteId: "pa1", sessaoId: "se2", statusPresenca: "AUSENTE", dataCheckin: null, usuarioId: null },
];

export const trabalhosSeed: Trabalho[] = [
  {
    id: "t1",
    titulo: "Aplicação de Redes Neurais na Predição de Evasão Escolar",
    resumo: "Estudo sobre o uso de modelos preditivos para identificar risco de evasão escolar.",
    arquivo: "trabalho-evasao-escolar.pdf",
    autorId: "pa3",
    statusAvaliacao: "APROVADO",
  },
  {
    id: "t2",
    titulo: "Sistema de Recomendação para Bibliotecas Acadêmicas",
    resumo: "Proposta de sistema de recomendação de acervos baseado em histórico de empréstimos.",
    arquivo: "trabalho-recomendacao-biblioteca.pdf",
    autorId: "pa2",
    statusAvaliacao: "PENDENTE",
  },
];

export const feedbacksSeed: Feedback[] = [
  { id: "f1", eventoId: "e1", participanteId: "pa1", nota: 5, comentario: "Evento muito bem organizado, ótimas palestras." },
  { id: "f2", eventoId: "e1", participanteId: "pa2", nota: 4, comentario: "Gostei bastante, só achei o intervalo curto." },
];
