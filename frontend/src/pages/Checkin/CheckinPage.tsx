import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { checkinService } from "../../services";
import { ANTECEDENCIA_CHECKIN_MS, LIMITE_BUSCA_ALUNOS, type InscricaoDetalhada } from "../../services/checkinService";
import type { Participante, StatusPresenca } from "../../types";

// mesma mensagem que o backend devolve (409) se alguem tentar mudar a presenca mesmo assim
const MENSAGEM_PRESENCA_TRAVADA = "A presença não pode mais ser alterada: o aluno já respondeu o questionário.";

// o check-in abre 1 hora antes do inicio (o backend responde 409 CHECKIN_NAO_LIBERADO antes disso)
function mensagemCheckinFechado(eventoHorario: string): string {
  const abre = new Date(new Date(eventoHorario).getTime() - ANTECEDENCIA_CHECKIN_MS);
  const data = abre.toLocaleDateString("pt-BR");
  const hora = abre.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `O check-in abre em ${data} às ${hora} (1 hora antes do início).`;
}

// traduz o status em cor pra Badge
function badgeTone(status: StatusPresenca): "green" | "red" | "orange" {
  if (status === "PRESENTE") return "green";
  if (status === "AUSENTE") return "red";
  return "orange";
}

// traduz o status em texto pra Badge
function badgeLabel(status: StatusPresenca): string {
  if (status === "PRESENTE") return "Presente";
  if (status === "AUSENTE") return "Ausente";
  return "Pendente";
}

// lista todos os alunos cadastrados; a busca so filtra essa lista. Confirmacao de presenca por aluno
export function CheckinPage() {
  const { usuario } = useAuth();
  const [alunos, setAlunos] = useState<Participante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [termo, setTermo] = useState("");
  const [selecionado, setSelecionado] = useState<Participante | null>(null);
  const [inscricoes, setInscricoes] = useState<InscricaoDetalhada[]>([]);
  const [carregandoInscricoes, setCarregandoInscricoes] = useState(false);

  // busca no servidor por nome, e-mail ou RGM enquanto se digita (espera 300 ms sem digitar pra nao
  // consultar a cada tecla). Traz no maximo LIMITE_BUSCA_ALUNOS: nunca baixa todos os alunos de uma vez
  useEffect(() => {
    let descartar = false;
    setCarregando(true);
    setErroCarga(null);
    const espera = setTimeout(() => {
      checkinService
        .listarAlunos(termo)
        .then((lista) => {
          if (!descartar) setAlunos(lista);
        })
        .catch((e) => {
          if (!descartar) setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar os alunos.");
        })
        .finally(() => {
          if (!descartar) setCarregando(false);
        });
    }, termo ? 300 : 0);
    return () => {
      descartar = true;
      clearTimeout(espera);
    };
  }, [termo, tentativa]);

  const filtrados = alunos;

  const selecionadoInativo = selecionado?.ativo === false;

  // guarda o participante clicado e carrega as inscricoes dele
  async function selecionar(participante: Participante) {
    setSelecionado(participante);
    // limpa as do aluno anterior e mostra "Carregando" (e nao "nao possui inscricoes") ate chegarem
    setInscricoes([]);
    setCarregandoInscricoes(true);
    try {
      setInscricoes(await checkinService.listarInscricoesDoParticipante(participante.id));
    } catch (e) {
      setInscricoes([]);
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar as inscrições.");
    } finally {
      setCarregandoInscricoes(false);
    }
  }

  // confirma presenca e recarrega a lista pra atualizar o status na tela
  async function confirmar(inscricaoId: string) {
    if (!usuario || selecionadoInativo) return;
    try {
      await checkinService.confirmarPresenca(inscricaoId, usuario.id);
      if (selecionado) setInscricoes(await checkinService.listarInscricoesDoParticipante(selecionado.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível confirmar a presença.");
    }
  }

  // marca ausente e recarrega a lista
  async function marcarAusente(inscricaoId: string) {
    try {
      await checkinService.marcarAusente(inscricaoId);
      if (selecionado) setInscricoes(await checkinService.listarInscricoesDoParticipante(selecionado.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar a ausência.");
    }
  }

  return (
    <div>
      <PageHeader title="Check-in" />

      <div className="grid-2">
        <div className="card">
          <h3>Alunos</h3>
          <input
            className="search-input"
            placeholder="Buscar por nome, e-mail ou RGM…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoFocus
          />
          {!carregando && !erroCarga && alunos.length >= LIMITE_BUSCA_ALUNOS && (
            <p className="form-hint" style={{ margin: "8px 0" }}>
              Mostrando os {LIMITE_BUSCA_ALUNOS} primeiros{termo.trim() ? " resultados" : " alunos"}. Digite o nome, o
              e-mail ou o RGM para encontrar quem você procura.
            </p>
          )}
          <ul className="simple-list list-scroll">
            {carregando && <li className="empty-cell">Carregando alunos…</li>}
            {erroCarga && (
              <li className="empty-cell" role="alert">
                <p className="form-error" style={{ marginBottom: 10 }}>
                  {erroCarga}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setTentativa((n) => n + 1)}>
                  Tentar novamente
                </button>
              </li>
            )}
            {!carregando &&
              !erroCarga &&
              filtrados.map((participante) => (
                <li
                  key={participante.id}
                  className={"simple-list-item clickable" + (selecionado?.id === participante.id ? " selected" : "")}
                  onClick={() => void selecionar(participante)}
                >
                  <div className="simple-list-item-row">
                    <div className="simple-list-title">{participante.nome}</div>
                    {participante.ativo === false && <Badge tone="red">Inativo</Badge>}
                  </div>
                  <div className="simple-list-sub">
                    {participante.email} · RGM {participante.rgm}
                  </div>
                </li>
              ))}
            {!carregando && !erroCarga && filtrados.length === 0 && (
              <li className="empty-cell">{termo.trim() ? "Nenhum aluno encontrado com essa busca." : "Nenhum aluno cadastrado."}</li>
            )}
          </ul>
        </div>

        <div className="card">
          <h3>{selecionado ? `Inscrições de ${selecionado.nome}` : "Selecione um aluno"}</h3>
          {selecionadoInativo && (
            <p className="form-error" style={{ marginBottom: 10 }}>
              Aluno inativo: não é possível confirmar presença.
            </p>
          )}
          {selecionado && (
            <table className="table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inscricoes.map((item) => {
                  // motivo pra nao mexer na presenca agora (a trava do questionario vale mais que a janela)
                  const bloqueio = item.presencaTravada
                    ? MENSAGEM_PRESENCA_TRAVADA
                    : !item.checkinAberto
                      ? mensagemCheckinFechado(item.eventoHorario)
                      : null;
                  return (
                    <tr key={item.inscricao.id}>
                      <td>
                        {item.eventoTitulo}
                        {bloqueio && <div className="form-hint">{bloqueio}</div>}
                      </td>
                      <td>
                        <Badge tone={badgeTone(item.inscricao.statusPresenca)}>
                          {badgeLabel(item.inscricao.statusPresenca)}
                        </Badge>
                      </td>
                      <td className="table-actions">
                        <button
                          className="btn btn-primary"
                          onClick={() => void confirmar(item.inscricao.id)}
                          disabled={selecionadoInativo || bloqueio !== null}
                          title={bloqueio ?? (selecionadoInativo ? "Aluno inativo" : undefined)}
                        >
                          Confirmar presença
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => void marcarAusente(item.inscricao.id)}
                          disabled={bloqueio !== null}
                          title={bloqueio ?? undefined}
                        >
                          Ausente
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {inscricoes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      {carregandoInscricoes ? "Carregando inscrições…" : "Este aluno não possui inscrições."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
