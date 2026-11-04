import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { formatarCodigoValidacao, titularService, type MeusDados } from "../../services";
import type { StatusPresenca } from "../../types";
import { ASSUNTO_PEDIDO_LGPD, EMAIL_PRIVACIDADE, PRAZO_RESPOSTA_DIAS, linkPedidoPrivacidade } from "../../utils/privacidade";

const PRESENCA: Record<StatusPresenca, { texto: string; tom: "green" | "red" | "orange" }> = {
  PRESENTE: { texto: "Presente", tom: "green" },
  AUSENTE: { texto: "Ausente", tom: "red" },
  PENDENTE: { texto: "Pendente", tom: "orange" },
};

function dataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// cartao com tabela simples; sem linhas, mostra o aviso no lugar
function Secao({ titulo, colunas, vazio, linhas }: { titulo: string; colunas: string[]; vazio: string; linhas: ReactNode[][] }) {
  return (
    <div className="card">
      <h3>{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="empty-cell">{vazio}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((celulas, i) => (
              <tr key={i}>
                {celulas.map((celula, j) => (
                  <td key={j}>{celula}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// RF026 (LGPD, art. 18): o aluno ve tudo o que o sistema guarda sobre ele e baixa uma copia em JSON.
// Os outros pedidos (correcao, exclusao, revisao humana, oposicao) sao atendidos pelo e-mail de privacidade
export function MeusDadosPage() {
  const { usuario } = useAuth();
  const [dados, setDados] = useState<MeusDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    titularService
      .meusDados()
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar seus dados."));
  }, []);

  async function baixar() {
    setBaixando(true);
    try {
      await titularService.baixarExportacao();
      toast.success("Arquivo com seus dados baixado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar seus dados.");
    } finally {
      setBaixando(false);
    }
  }

  const cadastro = dados?.dadosCadastrais;

  return (
    <div>
      <PageHeader
        title="Meus dados"
        actions={
          <button className="btn btn-primary" onClick={() => void baixar()} disabled={!dados || baixando}>
            {baixando ? "Gerando arquivo…" : "Baixar meus dados (JSON)"}
          </button>
        }
      />

      <p className="form-hint" style={{ marginBottom: 16 }}>
        Tudo o que o SGEA guarda sobre você, conforme a Lei Geral de Proteção de Dados (LGPD). O arquivo JSON traz
        exatamente estas informações, num formato que outros sistemas conseguem ler.
      </p>

      {erro && (
        <div className="card">
          <p className="form-error">{erro}</p>
        </div>
      )}
      {!dados && !erro && (
        <div className="card">
          <p className="empty-cell">Carregando seus dados…</p>
        </div>
      )}

      {dados && cadastro && (
        <>
          <Secao
            titulo="Dados cadastrais"
            colunas={["Informação", "Valor"]}
            vazio=""
            linhas={[
              ["Nome", cadastro.nome],
              ["E-mail", cadastro.email],
              ["RGM", cadastro.rgm],
              ["Cadastro feito em", dataHora(cadastro.cadastradoEm)],
              [
                "Aceite dos Termos de Uso e da Política de Privacidade",
                cadastro.termos.aceitoEm
                  ? `${dataHora(cadastro.termos.aceitoEm)}${cadastro.termos.versao ? ` (versão ${cadastro.termos.versao})` : ""}`
                  : "—",
              ],
              [
                "Autenticação em dois fatores",
                cadastro.doisFatores.ativo
                  ? `Ativa${cadastro.doisFatores.ativadoEm ? ` desde ${dataHora(cadastro.doisFatores.ativadoEm)}` : ""}`
                  : "Desativada",
              ],
            ]}
          />

          <Secao
            titulo="Inscrições e presenças"
            colunas={["Evento", "Data do evento", "Inscrição em", "Presença", "Check-in"]}
            vazio="Você não tem inscrições."
            linhas={dados.inscricoes.map((i) => [
              i.evento,
              dataHora(i.dataEvento),
              dataHora(i.inscritoEm),
              <Badge tone={PRESENCA[i.presenca].tom}>{PRESENCA[i.presenca].texto}</Badge>,
              dataHora(i.checkinEm),
            ])}
          />

          <Secao
            titulo="Questionários"
            colunas={["Evento", "Respondido em", "Acertos", "Percentual"]}
            vazio="Você ainda não respondeu nenhum questionário."
            linhas={dados.questionarios.map((q) => [
              q.evento,
              dataHora(q.respondidoEm),
              `${q.acertos} de ${q.totalPerguntas}`,
              `${q.percentual}%`,
            ])}
          />

          <Secao
            titulo="Certificados"
            colunas={["Evento", "Data do evento", "Carga horária", "Código de validação", "Emitido em"]}
            vazio="Você ainda não emitiu nenhum certificado."
            linhas={dados.certificados.map((c) => [
              c.evento,
              data(c.dataEvento),
              `${c.cargaHoraria}h`,
              formatarCodigoValidacao(c.codigoValidacao),
              dataHora(c.emitidoEm),
            ])}
          />

          <Secao
            titulo="Avaliações"
            colunas={["Evento", "Nota", "Comentário", "Enviada em"]}
            vazio="Você não enviou nenhuma avaliação."
            linhas={dados.avaliacoes.map((a) => [a.evento, `${a.nota} de 5`, a.comentario, dataHora(a.enviadaEm)])}
          />
        </>
      )}

      <div className="card">
        <h3>Outros pedidos sobre seus dados</h3>
        <p className="form-hint" style={{ marginBottom: 8 }}>
          Para pedir a <strong>correção</strong> de algum dado, a <strong>exclusão da sua conta</strong>, a{" "}
          <strong>revisão humana do resultado de um questionário</strong> (que é calculado automaticamente e libera o
          certificado) ou para se <strong>opor ao tratamento</strong> dos seus dados, escreva para{" "}
          <strong>{EMAIL_PRIVACIDADE}</strong>. A resposta chega em até {PRAZO_RESPOSTA_DIAS} dias.
        </p>
        <a
          className="btn btn-primary"
          style={{ display: "inline-block", textDecoration: "none" }}
          href={linkPedidoPrivacidade(ASSUNTO_PEDIDO_LGPD, cadastro?.rgm ?? usuario?.rgm)}
        >
          Enviar pedido por e-mail
        </a>
      </div>
    </div>
  );
}
