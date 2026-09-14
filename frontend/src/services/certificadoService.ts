import { jsPDF } from "jspdf";
import type { Inscricao, TentativaQuestionario } from "../types";
import { PERCENTUAL_APROVACAO } from "../utils/questionario";
import { USE_MOCK, api } from "./api";
import { eventoService, inscricaoService, palestranteService, participanteService } from "./entityServices";
import { questionarioService } from "./questionarioService";

// tudo que o pdf do certificado precisa, ja "achatado"
export interface CertificadoDisponivel {
  inscricaoId: string;
  participanteId: string;
  participanteNome: string;
  participanteRgm: string;
  eventoId: string;
  eventoTitulo: string;
  tema: string;
  palestranteNome: string;
  data: string;
  cargaHoraria: number;
  codigoValidacao: string;
  // melhor percentual do aluno no questionario desse evento, null se ainda nao respondeu
  melhorPercentual: number | null;
  questionarioAprovado: boolean;
  // quantas das tentativas permitidas (ver MAX_TENTATIVAS_QUESTIONARIO) o aluno ja usou
  tentativasUsadas: number;
}

// hash simples pra gerar um codigo curto e consistente por inscricao, so decorativo
function gerarCodigoValidacao(inscricaoId: string): string {
  let hash = 0;
  for (let i = 0; i < inscricaoId.length; i++) {
    hash = (hash * 31 + inscricaoId.charCodeAt(i)) >>> 0;
  }
  const prefixo = inscricaoId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6).padEnd(6, "0");
  const sufixo = hash.toString(36).toUpperCase().padStart(6, "0");
  return `SGEA-${prefixo}-${sufixo}`;
}

// junta cada Inscricao com Evento/Palestrante/Participante, pula dado orfao
// todasTentativas: quando informado (visao de equipe, varios alunos de uma vez), filtra localmente
// porque a rota por evento/aluno eh restrita ao proprio aluno respondendo
async function enriquecer(
  inscricoes: Inscricao[],
  todasTentativas?: TentativaQuestionario[],
): Promise<CertificadoDisponivel[]> {
  const [eventos, palestrantes, participantes] = await Promise.all([
    eventoService.list(),
    palestranteService.list(),
    participanteService.list(),
  ]);

  const certificados: CertificadoDisponivel[] = [];
  for (const inscricao of inscricoes) {
    const evento = eventos.find((e) => e.id === inscricao.eventoId);
    const participante = participantes.find((p) => p.id === inscricao.participanteId);
    if (!evento || !participante) continue;
    const palestrante = palestrantes.find((p) => p.id === evento.palestranteId);

    const tentativas = todasTentativas
      ? todasTentativas.filter((t) => t.eventoId === evento.id && t.participanteId === participante.id)
      : await questionarioService.listarTentativas(evento.id, participante.id);
    const melhorPercentual = tentativas.length > 0 ? Math.max(...tentativas.map((t) => t.percentual)) : null;

    certificados.push({
      inscricaoId: inscricao.id,
      participanteId: participante.id,
      participanteNome: participante.nome,
      participanteRgm: participante.rgm,
      eventoId: evento.id,
      eventoTitulo: evento.titulo,
      tema: evento.tema || evento.titulo,
      palestranteNome: palestrante?.nome ?? "—",
      data: evento.horario,
      cargaHoraria: evento.cargaHoraria ?? 0,
      codigoValidacao: gerarCodigoValidacao(inscricao.id),
      melhorPercentual,
      questionarioAprovado: melhorPercentual !== null && melhorPercentual >= PERCENTUAL_APROVACAO,
      tentativasUsadas: tentativas.length,
    });
  }
  return certificados;
}

// paleta do modelo oficial UMC
const AZUL_MARINHO: [number, number, number] = [17, 51, 102];
const AZUL_CLARO: [number, number, number] = [125, 178, 222];
const CINZA_TEXTO: [number, number, number] = [40, 40, 40];
const CINZA_SELO: [number, number, number] = [176, 176, 176];
const CINZA_SELO_ANEL: [number, number, number] = [130, 130, 130];

// moldura com cantos em "L" — imita o recorte azul do modelo oficial
function desenharMoldura(doc: jsPDF, largura: number, altura: number): void {
  const margem = 8;
  doc.setDrawColor(...AZUL_CLARO);
  doc.setLineWidth(0.6);
  doc.rect(margem, margem, largura - margem * 2, altura - margem * 2);

  const inset = margem + 2.5;
  doc.setDrawColor(...AZUL_MARINHO);
  doc.setLineWidth(0.4);
  doc.rect(inset, inset, largura - inset * 2, altura - inset * 2);

  const perna = 14;
  doc.setLineWidth(2);
  const cantos: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [largura - inset, inset, -1, 1],
    [inset, altura - inset, 1, -1],
    [largura - inset, altura - inset, -1, -1],
  ];
  for (const [x, y, dx, dy] of cantos) {
    doc.line(x, y, x + perna * dx, y);
    doc.line(x, y, x, y + perna * dy);
  }
}

// logo "UMC" + "UNIVERSIDADE" espaçado, centralizado no topo
function desenharLogo(doc: jsPDF, meio: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...AZUL_MARINHO);
  doc.text("UMC", meio, 32, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("U N I V E R S I D A D E", meio, 39, { align: "center" });
}

// selo circular prateado com "UMC" no meio e um anel decorativo
function desenharSelo(doc: jsPDF, x: number, y: number): void {
  const raio = 14;
  doc.setFillColor(...CINZA_SELO);
  doc.setDrawColor(...CINZA_SELO_ANEL);
  doc.setLineWidth(0.5);
  doc.circle(x, y, raio, "FD");
  doc.circle(x, y, raio - 2.5, "S");

  for (let i = 0; i < 28; i++) {
    const angulo = (i / 28) * Math.PI * 2;
    const x1 = x + Math.cos(angulo) * (raio - 1);
    const y1 = y + Math.sin(angulo) * (raio - 1);
    const x2 = x + Math.cos(angulo) * (raio + 1.2);
    const y2 = y + Math.sin(angulo) * (raio + 1.2);
    doc.line(x1, y1, x2, y2);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text("UMC", x, y + 1.5, { align: "center" });
}

// assinatura em itálico + linha + legenda, alinhado à esquerda embaixo
function desenharAssinatura(doc: jsPDF, x: number, y: number): void {
  doc.setFont("times", "italic");
  doc.setFontSize(19);
  doc.setTextColor(...CINZA_TEXTO);
  doc.text("Diretoria Acadêmica", x, y, { align: "left" });

  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.3);
  doc.line(x, y + 3.5, x + 58, y + 3.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Diretoria Acadêmica", x, y + 9, { align: "left" });
}

// pdf montado no navegador com jspdf, seguindo o modelo oficial de certificado da UMC
function gerarPdf(dados: CertificadoDisponivel): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const meio = largura / 2;
  const dataFormatada = dados.data ? new Date(dados.data).toLocaleDateString("pt-BR") : "—";

  desenharMoldura(doc, largura, altura);
  desenharLogo(doc, meio);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(24);
  doc.setTextColor(20, 20, 20);
  doc.text("Certificado de Participação", meio, 62, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...CINZA_TEXTO);
  const corpo =
    `Certificamos que ${dados.participanteNome} (RGM ${dados.participanteRgm}) participou do evento ` +
    `"${dados.eventoTitulo}", com tema "${dados.tema}", ministrado por ${dados.palestranteNome}, ` +
    `realizado em ${dataFormatada}, com carga horária de ${dados.cargaHoraria}h.`;
  const linhas = doc.splitTextToSize(corpo, largura - 110);
  doc.text(linhas, meio, 85, { align: "center", lineHeightFactor: 1.5 });

  desenharAssinatura(doc, 40, altura - 45);
  desenharSelo(doc, largura - 55, altura - 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Código de validação: ${dados.codigoValidacao}`, meio, altura - 15, { align: "center" });

  doc.save(`certificado-${dados.eventoId}-${dados.participanteId}.pdf`);
}

interface CertificadoService {
  listarCertificadosDoParticipante(participanteId: string): Promise<CertificadoDisponivel[]>;
  listarTodosCertificados(): Promise<CertificadoDisponivel[]>;
  gerarCertificado(dados: CertificadoDisponivel): void;
}

// mock: certificado so existe se a inscricao estiver PRESENTE
const localCertificadoService: CertificadoService = {
  // certificados de UM aluno, so os eventos onde ele tem PRESENTE
  async listarCertificadosDoParticipante(participanteId) {
    const inscricoes = (await inscricaoService.list()).filter(
      (i) => i.participanteId === participanteId && i.statusPresenca === "PRESENTE",
    );
    return enriquecer(inscricoes);
  },
  // certificados de todo mundo, usado na tela de gestao
  async listarTodosCertificados() {
    const [inscricoes, todasTentativas] = await Promise.all([
      inscricaoService.list(),
      questionarioService.listarTodasTentativas(),
    ]);
    return enriquecer(
      inscricoes.filter((i) => i.statusPresenca === "PRESENTE"),
      todasTentativas,
    );
  },
  // gera o pdf e ja dispara o download
  gerarCertificado(dados) {
    gerarPdf(dados);
  },
};

const httpCertificadoService: CertificadoService = {
  // mesma regra do mock, so que a filtragem por status ja vem da query
  async listarCertificadosDoParticipante(participanteId) {
    const inscricoes = await api.get<Inscricao[]>(`/inscricoes?participanteId=${participanteId}&status=PRESENTE`);
    return enriquecer(inscricoes);
  },
  // certificados de todo mundo, usado na tela de gestao
  async listarTodosCertificados() {
    const [inscricoes, todasTentativas] = await Promise.all([
      api.get<Inscricao[]>("/inscricoes"),
      questionarioService.listarTodasTentativas(),
    ]);
    return enriquecer(
      inscricoes.filter((i) => i.statusPresenca === "PRESENTE"),
      todasTentativas,
    );
  },
  // pdf sempre montado no navegador, mock ou nao
  gerarCertificado(dados) {
    gerarPdf(dados);
  },
};

export const certificadoService: CertificadoService = USE_MOCK ? localCertificadoService : httpCertificadoService;
