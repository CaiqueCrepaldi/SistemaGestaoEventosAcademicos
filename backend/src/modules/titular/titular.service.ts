import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import type { StatusPresenca } from "../../types/domain";

// RF026 (LGPD, art. 18, II): tudo o que o sistema guarda sobre o aluno, sempre do participante do
// token. Fica de fora o que nao e informacao sobre a pessoa e so serve a seguranca da conta (hash da
// senha, segredo e codigos de recuperacao do 2FA) e, no questionario, o gabarito e as alternativas
// marcadas — vai so o resultado (acertos e percentual)
export interface MeusDados {
  geradoEm: string;
  dadosCadastrais: {
    nome: string;
    email: string;
    rgm: string;
    cadastradoEm: string;
    termos: { aceitoEm: string | null; versao: string | null };
    doisFatores: { ativo: boolean; ativadoEm: string | null };
  };
  inscricoes: {
    evento: string;
    dataEvento: string;
    inscritoEm: string;
    presenca: StatusPresenca;
    checkinEm: string | null;
  }[];
  questionarios: {
    evento: string;
    respondidoEm: string;
    acertos: number;
    totalPerguntas: number;
    percentual: number;
  }[];
  certificados: {
    evento: string;
    dataEvento: string;
    cargaHoraria: number;
    codigoValidacao: string;
    emitidoEm: string;
    // o que foi impresso no certificado, copiado na emissao
    nomeImpresso: string;
    rgmImpresso: string;
  }[];
  avaliacoes: {
    evento: string;
    nota: number;
    comentario: string;
    enviadaEm: string;
  }[];
}

const SO_TITULO = { select: { titulo: true } } as const;

async function montar(participanteId: string): Promise<MeusDados> {
  const participante = await prisma.participante.findUnique({
    where: { id: participanteId },
    select: {
      rgm: true,
      usuarios: {
        where: { perfil: "ALUNO" },
        take: 1,
        select: {
          nome: true,
          emailLogin: true,
          criadoEm: true,
          consentimentoLgpdEm: true,
          versaoTermosAceitos: true,
          mfaAtivo: true,
          mfaAtivadoEm: true,
        },
      },
      inscricoes: {
        orderBy: { evento: { horario: "asc" } },
        select: {
          statusPresenca: true,
          dataCheckin: true,
          dataInscricao: true,
          evento: { select: { titulo: true, horario: true } },
          certificado: true,
        },
      },
      // so o resultado: as respostas marcadas (e o gabarito, que fica no evento) nao saem daqui
      tentativas: {
        orderBy: { criadoEm: "asc" },
        select: { acertos: true, totalPerguntas: true, percentual: true, criadoEm: true, evento: SO_TITULO },
      },
      feedbacks: {
        orderBy: { criadoEm: "asc" },
        select: { nota: true, comentario: true, criadoEm: true, evento: SO_TITULO },
      },
    },
  });
  const conta = participante?.usuarios[0];
  if (!participante || !conta) {
    throw AppError.naoEncontrado("PARTICIPANTE_NAO_ENCONTRADO", "Não encontramos os dados desta conta.");
  }

  return {
    geradoEm: new Date().toISOString(),
    dadosCadastrais: {
      nome: conta.nome,
      email: conta.emailLogin,
      rgm: participante.rgm,
      cadastradoEm: conta.criadoEm.toISOString(),
      termos: { aceitoEm: conta.consentimentoLgpdEm?.toISOString() ?? null, versao: conta.versaoTermosAceitos },
      doisFatores: { ativo: conta.mfaAtivo, ativadoEm: conta.mfaAtivadoEm?.toISOString() ?? null },
    },
    inscricoes: participante.inscricoes.map((i) => ({
      evento: i.evento.titulo,
      dataEvento: i.evento.horario.toISOString(),
      inscritoEm: i.dataInscricao.toISOString(),
      presenca: i.statusPresenca,
      checkinEm: i.dataCheckin?.toISOString() ?? null,
    })),
    questionarios: participante.tentativas.map((t) => ({
      evento: t.evento.titulo,
      respondidoEm: t.criadoEm.toISOString(),
      acertos: t.acertos,
      totalPerguntas: t.totalPerguntas,
      percentual: t.percentual,
    })),
    certificados: participante.inscricoes.flatMap(({ certificado: c }) =>
      c
        ? [
            {
              evento: c.tituloEvento,
              dataEvento: c.dataEvento.toISOString(),
              cargaHoraria: c.cargaHoraria,
              codigoValidacao: c.codigoValidacao,
              emitidoEm: c.emitidoEm.toISOString(),
              nomeImpresso: c.nomeParticipante,
              rgmImpresso: c.rgm,
            },
          ]
        : [],
    ),
    avaliacoes: participante.feedbacks.map((f) => ({
      evento: f.evento.titulo,
      nota: f.nota,
      comentario: f.comentario,
      enviadaEm: f.criadoEm.toISOString(),
    })),
  };
}

// consulta na tela Meus dados: so leitura, nao grava nada (nem solicitacao nem log)
async function meusDados(participanteId: string): Promise<MeusDados> {
  return montar(participanteId);
}

export const titularService = { meusDados };
