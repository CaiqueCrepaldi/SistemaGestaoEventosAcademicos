// Dados de demonstração carregados em memória quando o servidor sobe —
// os mesmos usados no mock do frontend (frontend/src/services/seed.ts),
// pra logar com as mesmas contas dos dois lados. Como o "banco" aqui é só
// em memória (ver repositorio.ts), isso é recriado do zero a cada reinício
// do servidor.
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { Evento, Feedback, Inscricao, Palestrante, Participante, Sala, Usuario } from "../types/domain";

const agora = new Date().toISOString();

// hashSync (em vez do gerarHashSenha async de utils/password.ts) só
// porque isso roda uma vez, de forma síncrona, no carregamento do módulo —
// não vale a pena complicar com top-level await por causa de 3 senhas fixas.
function hashSincrono(senha: string): string {
  return bcrypt.hashSync(senha, 10);
}

export const salasSeed: Sala[] = [
  { id: randomUUID(), nome: "Auditório A", capacidade: 120 },
  { id: randomUUID(), nome: "Sala 204", capacidade: 40 },
  { id: randomUUID(), nome: "Laboratório de Informática 1", capacidade: 30 },
];
const [salaAuditorio, sala204, salaLab1] = salasSeed;

export const palestrantesSeed: Palestrante[] = [
  {
    id: randomUUID(),
    nome: "Dra. Mariana Costa",
    curriculo: "Doutora em Ciência da Computação, pesquisadora em Inteligência Artificial.",
    telefone: "(11) 98888-1111",
  },
  {
    id: randomUUID(),
    nome: "Msc. Felipe Andrade",
    curriculo: "Mestre em Engenharia de Software, atua no mercado com arquitetura de sistemas.",
    telefone: "(11) 97777-2222",
  },
];
const [palestranteMariana, palestranteFelipe] = palestrantesSeed;

export const eventosSeed: Evento[] = [
  {
    id: randomUUID(),
    titulo: "Abertura e Palestra Magna: IA na Educação",
    horario: "2026-09-14T09:00:00-03:00",
    salaId: salaAuditorio.id,
    palestranteId: palestranteMariana.id,
    tema: "Inteligência Artificial aplicada à Educação",
    cargaHoraria: 2,
    perguntas: [
      "O conteúdo apresentado atendeu suas expectativas?",
      "Você recomendaria este evento a outros alunos?",
    ],
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Minicurso: Arquitetura de Microsserviços",
    horario: "2026-09-14T14:00:00-03:00",
    salaId: sala204.id,
    palestranteId: palestranteFelipe.id,
    tema: "Arquitetura de Microsserviços na prática",
    cargaHoraria: 4,
    perguntas: ["O palestrante dominava o assunto apresentado?"],
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Workshop Prático: React na Prática",
    horario: "2026-09-15T10:00:00-03:00",
    salaId: salaLab1.id,
    palestranteId: palestranteFelipe.id,
    tema: "Desenvolvimento front-end com React",
    cargaHoraria: 4,
    perguntas: [],
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Sessão de Apresentação de Pôsteres",
    horario: "2026-10-05T13:30:00-03:00",
    salaId: sala204.id,
    palestranteId: palestranteMariana.id,
    tema: "Iniciação Científica: pôsteres e resultados",
    cargaHoraria: 3,
    perguntas: [],
    criadoEm: agora,
  },
];
const [eventoAbertura, eventoMicrosservicos] = eventosSeed;

export const participantesSeed: Participante[] = [
  { id: randomUUID(), nome: "João Pedro Lima", email: "joao.lima@aluno.ifsp.edu.br", rgm: "2024010011", criadoEm: agora },
  { id: randomUUID(), nome: "Beatriz Fernandes", email: "beatriz.fernandes@aluno.ifsp.edu.br", rgm: "2024010022", criadoEm: agora },
  { id: randomUUID(), nome: "Lucas Martins", email: "lucas.martins@aluno.ifsp.edu.br", rgm: "2023010033", criadoEm: agora },
];
const [participanteJoao, participanteBeatriz, participanteLucas] = participantesSeed;

export const usuariosSeed: Usuario[] = [
  {
    id: randomUUID(),
    nome: "Ana Ribeiro",
    emailLogin: "admin@ifsp.edu.br",
    senhaHash: hashSincrono("admin123"),
    perfil: "ADMINISTRADOR",
    rgm: null,
    participanteId: null,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    nome: "Carlos Souza",
    emailLogin: "secretaria@ifsp.edu.br",
    senhaHash: hashSincrono("secretaria123"),
    perfil: "SECRETARIA",
    rgm: null,
    participanteId: null,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    nome: "João Pedro Lima",
    emailLogin: "aluno@aluno.ifsp.edu.br",
    senhaHash: hashSincrono("aluno123"),
    perfil: "ALUNO",
    rgm: "2024010011",
    participanteId: participanteJoao.id,
    criadoEm: agora,
  },
];
const [usuarioAdmin] = usuariosSeed;

export const inscricoesSeed: Inscricao[] = [
  {
    id: randomUUID(),
    participanteId: participanteJoao.id,
    eventoId: eventoAbertura.id,
    statusPresenca: "PRESENTE",
    dataCheckin: "2026-09-14T09:05:00-03:00",
    usuarioId: usuarioAdmin.id,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteBeatriz.id,
    eventoId: eventoAbertura.id,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteLucas.id,
    eventoId: eventoMicrosservicos.id,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteJoao.id,
    eventoId: eventoMicrosservicos.id,
    statusPresenca: "AUSENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
];

export const feedbacksSeed: Feedback[] = [
  {
    id: randomUUID(),
    eventoId: eventoAbertura.id,
    participanteId: participanteJoao.id,
    nota: 5,
    comentario: "Evento muito bem organizado, ótimas palestras.",
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    eventoId: eventoAbertura.id,
    participanteId: participanteBeatriz.id,
    nota: 4,
    comentario: "Gostei bastante, só achei o intervalo curto.",
    criadoEm: agora,
  },
];
