import { jsPDF } from "jspdf";
import type { Inscricao } from "../types";
import { USE_MOCK, api } from "./api";
import { eventoService, inscricaoService, palestranteService, participanteService, sessaoService } from "./entityServices";

export interface CertificadoDisponivel {
  inscricaoId: string;
  participanteId: string;
  participanteNome: string;
  participanteRgm: string;
  eventoId: string;
  eventoNome: string;
  sessaoId: string;
  sessaoTitulo: string;
  tema: string;
  palestranteNome: string;
  data: string;
  cargaHoraria: number;
  codigoValidacao: string;
}

function gerarCodigoValidacao(inscricaoId: string): string {
  let hash = 0;
  for (let i = 0; i < inscricaoId.length; i++) {
    hash = (hash * 31 + inscricaoId.charCodeAt(i)) >>> 0;
  }
  const prefixo = inscricaoId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6).padEnd(6, "0");
  const sufixo = hash.toString(36).toUpperCase().padStart(6, "0");
  return `SGEA-${prefixo}-${sufixo}`;
}

async function enriquecer(inscricoes: Inscricao[]): Promise<CertificadoDisponivel[]> {
  const [sessoes, eventos, palestrantes, participantes] = await Promise.all([
    sessaoService.list(),
    eventoService.list(),
    palestranteService.list(),
    participanteService.list(),
  ]);

  const certificados: CertificadoDisponivel[] = [];
  for (const inscricao of inscricoes) {
    const sessao = sessoes.find((s) => s.id === inscricao.sessaoId);
    const participante = participantes.find((p) => p.id === inscricao.participanteId);
    if (!sessao || !participante) continue;
    const evento = eventos.find((e) => e.id === sessao.eventoId);
    if (!evento) continue;
    const palestrante = palestrantes.find((p) => p.id === sessao.palestranteId);

    certificados.push({
      inscricaoId: inscricao.id,
      participanteId: participante.id,
      participanteNome: participante.nome,
      participanteRgm: participante.rgm,
      eventoId: evento.id,
      eventoNome: evento.nome,
      sessaoId: sessao.id,
      sessaoTitulo: sessao.titulo,
      tema: sessao.tema || sessao.titulo,
      palestranteNome: palestrante?.nome ?? "—",
      data: sessao.horario || evento.data,
      cargaHoraria: sessao.cargaHoraria ?? 0,
      codigoValidacao: gerarCodigoValidacao(inscricao.id),
    });
  }
  return certificados;
}

function gerarPdf(dados: CertificadoDisponivel): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const meio = largura / 2;
  const dataFormatada = dados.data ? new Date(dados.data).toLocaleDateString("pt-BR") : "—";

  doc.setFontSize(26);
  doc.text("Certificado de Participação", meio, 45, { align: "center" });

  doc.setFontSize(13);
  const corpo =
    `Certificamos que ${dados.participanteNome} (RGM ${dados.participanteRgm}) participou da sessão ` +
    `"${dados.sessaoTitulo}", com tema "${dados.tema}", ministrada por ${dados.palestranteNome}, ` +
    `no evento ${dados.eventoNome}, realizado em ${dataFormatada}, com carga horária de ${dados.cargaHoraria}h.`;
  const linhas = doc.splitTextToSize(corpo, largura - 70);
  doc.text(linhas, meio, 75, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Código de validação: ${dados.codigoValidacao}`, meio, 130, { align: "center" });

  doc.save(`certificado-${dados.sessaoId}-${dados.participanteId}.pdf`);
}

interface CertificadoService {
  listarCertificadosDoParticipante(participanteId: string): Promise<CertificadoDisponivel[]>;
  listarTodosCertificados(): Promise<CertificadoDisponivel[]>;
  gerarCertificado(dados: CertificadoDisponivel): void;
}

const localCertificadoService: CertificadoService = {
  async listarCertificadosDoParticipante(participanteId) {
    const inscricoes = (await inscricaoService.list()).filter(
      (i) => i.participanteId === participanteId && i.statusPresenca === "PRESENTE",
    );
    return enriquecer(inscricoes);
  },
  async listarTodosCertificados() {
    const inscricoes = (await inscricaoService.list()).filter((i) => i.statusPresenca === "PRESENTE");
    return enriquecer(inscricoes);
  },
  gerarCertificado(dados) {
    gerarPdf(dados);
  },
};

const httpCertificadoService: CertificadoService = {
  async listarCertificadosDoParticipante(participanteId) {
    const inscricoes = await api.get<Inscricao[]>(`/inscricoes?participanteId=${participanteId}&status=PRESENTE`);
    return enriquecer(inscricoes);
  },
  async listarTodosCertificados() {
    const inscricoes = (await api.get<Inscricao[]>("/inscricoes")).filter((i) => i.statusPresenca === "PRESENTE");
    return enriquecer(inscricoes);
  },
  gerarCertificado(dados) {
    gerarPdf(dados);
  },
};

export const certificadoService: CertificadoService = USE_MOCK ? localCertificadoService : httpCertificadoService;
