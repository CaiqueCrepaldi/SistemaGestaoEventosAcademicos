import { jsPDF } from "jspdf";
import type { Inscricao, TentativaQuestionario } from "../types";
import { PERCENTUAL_APROVACAO } from "../utils/questionario";
import { USE_MOCK, api } from "./api";
import { eventoService, inscricaoService, palestranteService, participanteService } from "./entityServices";
import { questionarioService } from "./questionarioService";

// Tudo que o PDF do certificado precisa pra ser desenhado — já vem "achatado"
// (sem precisar cruzar Inscricao/Evento/Participante de novo na tela).
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
  // Melhor percentual de acerto do aluno no questionário desse evento (null
  // se ele ainda não respondeu nenhuma vez) e se isso já basta pra liberar
  // o certificado (>= PERCENTUAL_APROVACAO).
  melhorPercentual: number | null;
  questionarioAprovado: boolean;
}

// Gera um código curto e determinístico (sempre o mesmo código pro mesmo
// id de inscrição) pra imprimir no certificado como referência visual.
// Não é uma assinatura criptográfica de verdade — é só um hash simples
// (soma ponderada dos códigos de caractere, base 31) convertido pra base36,
// só pra não repetir/ser previsível demais entre inscrições diferentes.
function gerarCodigoValidacao(inscricaoId: string): string {
  let hash = 0;
  for (let i = 0; i < inscricaoId.length; i++) {
    hash = (hash * 31 + inscricaoId.charCodeAt(i)) >>> 0;
  }
  const prefixo = inscricaoId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6).padEnd(6, "0");
  const sufixo = hash.toString(36).toUpperCase().padStart(6, "0");
  return `SGEA-${prefixo}-${sufixo}`;
}

// Junta cada Inscricao (já filtrada por "presente") com os dados do
// Evento/Palestrante/Participante correspondentes, montando a lista de
// certificados que a pessoa pode emitir. Pula silenciosamente qualquer
// inscrição cujo evento ou participante não exista mais (dado órfão).
//
// `todasTentativas`: quando informado (visão de equipe, que cruza vários
// alunos de uma vez), usa essa lista já carregada e filtra localmente — a
// rota HTTP por evento/aluno (`questionarioService.listarTentativas`) é
// restrita a ALUNO respondendo por si mesmo, então a equipe não pode
// chamá-la aluno por aluno; sem o parâmetro (visão do próprio aluno), busca
// direto pela rota própria de cada evento.
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

    // Melhor percentual entre todas as tentativas do aluno nesse
    // questionário — é o que decide se o certificado já pode ser emitido.
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

// Monta o PDF do certificado inteiramente no navegador com jsPDF (não existe
// endpoint de backend pra isso) e já dispara o download. Página A4 deitada,
// texto centralizado.
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
  // splitTextToSize quebra o texto em várias linhas que cabem na largura da
  // página, senão o parágrafo inteiro tentaria caber numa linha só.
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

// Versão mock: um certificado só "existe" se a inscrição estiver com
// statusPresenca === "PRESENTE" — é essa checagem que impede alguém de
// emitir certificado sem ter feito check-in.
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

// Versão HTTP: a mesma regra de "só presente vira certificado" é aplicada
// aqui do lado do cliente (filter), já que o backend não tem endpoint
// dedicado — só devolve a lista de inscrições filtrada por status na query.
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
    // O PDF é sempre montado no navegador, mock ou não — não existe
    // endpoint de download de certificado no backend.
    gerarPdf(dados);
  },
};

export const certificadoService: CertificadoService = USE_MOCK ? localCertificadoService : httpCertificadoService;
