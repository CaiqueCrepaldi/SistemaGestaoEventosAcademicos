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
    });
  }
  return certificados;
}

// pdf montado no navegador com jspdf, nao existe endpoint de backend pra isso
function gerarPdf(dados: CertificadoDisponivel): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const meio = largura / 2;
  const dataFormatada = dados.data ? new Date(dados.data).toLocaleDateString("pt-BR") : "—";

  doc.setFontSize(12);
  doc.text("Universidade de Mogi das Cruzes — UMC", meio, 25, { align: "center" });

  doc.setFontSize(26);
  doc.text("Certificado de Participação", meio, 45, { align: "center" });

  doc.setFontSize(13);
  const corpo =
    `Certificamos que ${dados.participanteNome} (RGM ${dados.participanteRgm}) participou do evento ` +
    `"${dados.eventoTitulo}", com tema "${dados.tema}", ministrado por ${dados.palestranteNome}, ` +
    `realizado em ${dataFormatada}, com carga horária de ${dados.cargaHoraria}h.`;
  const linhas = doc.splitTextToSize(corpo, largura - 70);
  doc.text(linhas, meio, 75, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Código de validação: ${dados.codigoValidacao}`, meio, 130, { align: "center" });

  doc.save(`certificado-${dados.eventoId}-${dados.participanteId}.pdf`);
}

interface CertificadoService {
  listarCertificadosDoParticipante(participanteId: string): Promise<CertificadoDisponivel[]>;
  listarTodosCertificados(): Promise<CertificadoDisponivel[]>;
  gerarCertificado(dados: CertificadoDisponivel): void;
}

// mock: certificado so existe se a inscricao estiver PRESENTE
const localCertificadoService: CertificadoService = {
  async listarCertificadosDoParticipante(participanteId) {
    const inscricoes = (await inscricaoService.list()).filter(
      (i) => i.participanteId === participanteId && i.statusPresenca === "PRESENTE",
    );
    return enriquecer(inscricoes);
  },
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
    const [inscricoes, todasTentativas] = await Promise.all([
      api.get<Inscricao[]>("/inscricoes"),
      questionarioService.listarTodasTentativas(),
    ]);
    return enriquecer(
      inscricoes.filter((i) => i.statusPresenca === "PRESENTE"),
      todasTentativas,
    );
  },
  gerarCertificado(dados) {
    gerarPdf(dados);
  },
};

export const certificadoService: CertificadoService = USE_MOCK ? localCertificadoService : httpCertificadoService;
