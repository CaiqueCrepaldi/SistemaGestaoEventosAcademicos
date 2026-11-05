import { jsPDF } from "jspdf";
import type { Inscricao, Pagina, Participante } from "../types";
import { PERCENTUAL_APROVACAO } from "../utils/questionario";
import { api } from "./api";
import { authService } from "./authService";
import { eventoService } from "./entityServices";
import { questionarioService } from "./questionarioService";

// certificado gravado no backend na primeira emissao (POST /certificados/emitir/:inscricaoId).
// O PDF sai sempre destes dados — codigo de validacao e textos impressos vem da API, nunca do navegador
export interface CertificadoEmitido {
  id: string;
  inscricaoId: string;
  eventoId: string;
  participanteId: string;
  codigoValidacao: string;
  nomeParticipante: string;
  rgm: string;
  tituloEvento: string;
  temaEvento: string;
  nomePalestrante: string;
  dataEvento: string;
  cargaHoraria: number;
  emitidoEm: string;
}

// o que a validacao publica devolve (sem RGM nem e-mail)
export interface CertificadoValidado {
  nomeParticipante: string;
  tituloEvento: string;
  dataEvento: string;
  cargaHoraria: number;
  emitidoEm: string;
}

// linha das telas de Certificados: inscricao com presenca confirmada + situacao do questionario e,
// se o certificado ja foi emitido, o codigo gravado no backend
export interface CertificadoDisponivel {
  inscricaoId: string;
  participanteId: string;
  participanteNome: string;
  participanteRgm: string;
  // aluno inativado pela equipe: o certificado de presenca ja confirmada continua valido
  participanteAtivo: boolean;
  eventoId: string;
  eventoTitulo: string;
  tema: string;
  data: string;
  cargaHoraria: number;
  // melhor percentual do aluno no questionario desse evento, null se ainda nao respondeu
  melhorPercentual: number | null;
  questionarioAprovado: boolean;
  // quantas das tentativas permitidas (ver MAX_TENTATIVAS_QUESTIONARIO) o aluno ja usou
  tentativasUsadas: number;
  // null enquanto o certificado nao foi emitido nenhuma vez
  codigoValidacao: string | null;
}

// "ABCDEFGHJKMN" -> "ABCD-EFGH-JKMN", mais facil de ler e digitar (a validacao aceita com ou sem hifen)
export function formatarCodigoValidacao(codigo: string): string {
  return codigo.match(/.{1,4}/g)?.join("-") ?? codigo;
}

// endereco da pagina publica de validacao (HashRouter: a rota fica depois do "#"). Com o codigo, o
// link do PDF ja abre a pagina com a consulta feita
export function urlValidacao(codigo?: string): string {
  const base = `${window.location.origin}${window.location.pathname}#/validar-certificado`;
  return codigo ? `${base}?codigo=${encodeURIComponent(codigo)}` : base;
}

// visao do aluno: junta cada inscricao dele com o evento, as proprias tentativas e o certificado ja
// emitido (se houver). A visao da equipe vem pronta e paginada do backend (GET /certificados/situacao)
async function enriquecer(
  inscricoes: Inscricao[],
  participantes: Participante[],
  emitidos: CertificadoEmitido[],
): Promise<CertificadoDisponivel[]> {
  const eventos = await eventoService.list();

  const certificados: CertificadoDisponivel[] = [];
  for (const inscricao of inscricoes) {
    const evento = eventos.find((e) => e.id === inscricao.eventoId);
    const participante = participantes.find((p) => p.id === inscricao.participanteId);
    if (!evento || !participante) continue;

    const tentativas = await questionarioService.listarTentativas(evento.id, participante.id);
    const melhorPercentual = tentativas.length > 0 ? Math.max(...tentativas.map((t) => t.percentual)) : null;

    certificados.push({
      inscricaoId: inscricao.id,
      participanteId: participante.id,
      participanteNome: participante.nome,
      participanteRgm: participante.rgm,
      participanteAtivo: participante.ativo !== false,
      eventoId: evento.id,
      eventoTitulo: evento.titulo,
      tema: evento.tema || evento.titulo,
      data: evento.horario,
      cargaHoraria: evento.cargaHoraria ?? 0,
      melhorPercentual,
      questionarioAprovado: melhorPercentual !== null && melhorPercentual >= PERCENTUAL_APROVACAO,
      tentativasUsadas: tentativas.length,
      codigoValidacao: emitidos.find((c) => c.inscricaoId === inscricao.id)?.codigoValidacao ?? null,
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

// rodape: codigo de validacao + endereco da pagina publica onde ele e conferido (o endereco e um
// link que ja abre a consulta com o codigo preenchido)
function desenharValidacao(doc: jsPDF, dados: CertificadoEmitido, meio: number, altura: number): void {
  const emitidoEm = new Date(dados.emitidoEm).toLocaleDateString("pt-BR");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`Código de validação: ${formatarCodigoValidacao(dados.codigoValidacao)} · emitido em ${emitidoEm}`, meio, altura - 20, {
    align: "center",
  });

  const endereco = `Confira a autenticidade em ${urlValidacao()}`;
  doc.setTextColor(...AZUL_MARINHO);
  doc.textWithLink(endereco, meio - doc.getTextWidth(endereco) / 2, altura - 14.5, { url: urlValidacao(dados.codigoValidacao) });
}

// pdf montado no navegador com jspdf, seguindo o modelo oficial de certificado da UMC, a partir do
// certificado registrado no backend
function gerarPdf(dados: CertificadoEmitido): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const meio = largura / 2;
  const dataFormatada = dados.dataEvento ? new Date(dados.dataEvento).toLocaleDateString("pt-BR") : "—";

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
    `Certificamos que ${dados.nomeParticipante} (RGM ${dados.rgm}) participou do evento ` +
    `"${dados.tituloEvento}", com tema "${dados.temaEvento}", ministrado por ${dados.nomePalestrante}, ` +
    `realizado em ${dataFormatada}, com carga horária de ${dados.cargaHoraria}h.`;
  const linhas = doc.splitTextToSize(corpo, largura - 110);
  doc.text(linhas, meio, 85, { align: "center", lineHeightFactor: 1.5 });

  desenharAssinatura(doc, 40, altura - 45);
  desenharSelo(doc, largura - 55, altura - 42);
  desenharValidacao(doc, dados, meio, altura);

  doc.save(`certificado-${dados.codigoValidacao}.pdf`);
}

// certificados ja emitidos: a equipe recebe todos, o aluno so os dele (o backend decide pelo token)
function listarEmitidos(eventoId?: string): Promise<CertificadoEmitido[]> {
  return api.get<CertificadoEmitido[]>(eventoId ? `/certificados?eventoId=${encodeURIComponent(eventoId)}` : "/certificados");
}

export interface FiltrosSituacaoCertificados {
  eventoId?: string;
  // nome, e-mail ou RGM do aluno
  busca?: string;
  page: number;
}

interface CertificadoService {
  listarCertificadosDoParticipante(participanteId: string): Promise<CertificadoDisponivel[]>;
  listarSituacao(filtros: FiltrosSituacaoCertificados): Promise<Pagina<CertificadoDisponivel>>;
  listarEmitidos(eventoId?: string): Promise<CertificadoEmitido[]>;
  emitirEBaixar(inscricaoId: string): Promise<CertificadoEmitido>;
  validar(codigo: string): Promise<CertificadoValidado>;
}

export const certificadoService: CertificadoService = {
  // visao do aluno: os dados do proprio certificado (nome/RGM) vem da propria conta
  async listarCertificadosDoParticipante(participanteId) {
    const [inscricoes, conta, emitidos] = await Promise.all([
      api.get<Inscricao[]>(`/inscricoes?participanteId=${participanteId}&status=PRESENTE`),
      authService.obterMe(),
      listarEmitidos(),
    ]);
    const euMesmo: Participante = { id: participanteId, nome: conta.nome, email: conta.emailLogin, rgm: conta.rgm ?? "" };
    return enriquecer(inscricoes, [euMesmo], emitidos);
  },
  // tela de gestao: uma pagina da situacao dos certificados, montada e filtrada no servidor
  listarSituacao(filtros) {
    const params = new URLSearchParams({ page: String(filtros.page), pageSize: "50" });
    if (filtros.eventoId) params.set("eventoId", filtros.eventoId);
    if (filtros.busca?.trim()) params.set("busca", filtros.busca.trim());
    return api.get<Pagina<CertificadoDisponivel>>(`/certificados/situacao?${params.toString()}`);
  },
  listarEmitidos,
  // o backend confere os requisitos, grava o certificado na primeira vez e devolve sempre o mesmo
  // registro depois; o PDF e montado com o que voltou
  async emitirEBaixar(inscricaoId) {
    const certificado = await api.post<CertificadoEmitido>(`/certificados/emitir/${inscricaoId}`);
    gerarPdf(certificado);
    return certificado;
  },
  // pagina publica: funciona sem login
  validar(codigo) {
    return api.get<CertificadoValidado>(`/certificados/validar/${encodeURIComponent(codigo.trim())}`);
  },
};
