import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { checkinService } from "../../services";
import type { InscricaoDetalhada } from "../../services/checkinService";
import type { Participante, StatusPresenca } from "../../types";

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

  // carrega a lista completa uma vez (o backend ja devolve decifrada e em ordem alfabetica)
  useEffect(() => {
    let descartar = false;
    setCarregando(true);
    setErroCarga(null);
    checkinService
      .listarAlunos()
      .then((lista) => {
        if (!descartar) setAlunos(lista);
      })
      .catch((e) => {
        if (!descartar) setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar os alunos.");
      })
      .finally(() => {
        if (!descartar) setCarregando(false);
      });
    return () => {
      descartar = true;
    };
  }, [tentativa]);

  // a busca so filtra a lista ja carregada: nome, e-mail ou RGM
  const filtrados = useMemo(() => {
    const alvo = termo.trim().toLowerCase();
    if (!alvo) return alunos;
    return alunos.filter(
      (p) => p.nome.toLowerCase().includes(alvo) || p.email.toLowerCase().includes(alvo) || p.rgm.toLowerCase().includes(alvo),
    );
  }, [alunos, termo]);

  const selecionadoInativo = selecionado?.ativo === false;

  // guarda o participante clicado e carrega as inscricoes dele
  async function selecionar(participante: Participante) {
    setSelecionado(participante);
    try {
      setInscricoes(await checkinService.listarInscricoesDoParticipante(participante.id));
    } catch (e) {
      setInscricoes([]);
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar as inscrições.");
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
            placeholder="Filtrar por nome, e-mail ou RGM…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoFocus
          />
          {!carregando && !erroCarga && (
            <p className="form-hint" style={{ margin: "8px 0" }}>
              {termo.trim()
                ? `${filtrados.length} de ${alunos.length} aluno${alunos.length === 1 ? "" : "s"}`
                : `${alunos.length} aluno${alunos.length === 1 ? "" : "s"} cadastrado${alunos.length === 1 ? "" : "s"}`}
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
              <li className="empty-cell">
                {alunos.length === 0 ? "Nenhum aluno cadastrado." : "Nenhum aluno encontrado com esse filtro."}
              </li>
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
                {inscricoes.map((item) => (
                  <tr key={item.inscricao.id}>
                    <td>{item.eventoTitulo}</td>
                    <td>
                      <Badge tone={badgeTone(item.inscricao.statusPresenca)}>
                        {badgeLabel(item.inscricao.statusPresenca)}
                      </Badge>
                    </td>
                    <td className="table-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => void confirmar(item.inscricao.id)}
                        disabled={selecionadoInativo}
                        title={selecionadoInativo ? "Aluno inativo" : undefined}
                      >
                        Confirmar presença
                      </button>
                      <button className="btn btn-ghost" onClick={() => void marcarAusente(item.inscricao.id)}>
                        Ausente
                      </button>
                    </td>
                  </tr>
                ))}
                {inscricoes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-cell">
                      Este aluno não possui inscrições.
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
