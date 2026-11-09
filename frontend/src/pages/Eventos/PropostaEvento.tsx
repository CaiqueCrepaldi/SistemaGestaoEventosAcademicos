import { useState } from "react";
import type { Mudanca } from "../../components/aprovacao/ResumoProposta";
import { Campo } from "../../components/ui/Campo";
import { Modal } from "../../components/ui/Modal";
import { toast } from "../../components/ui/Toast";
import { ApiError, aprovacaoService, avisarAprovacoesAlteradas } from "../../services";
import type { Evento, Palestrante, Sala } from "../../types";
import { inputLocalParaIso, isoParaInputLocal } from "../../utils/data";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

// o que a proposta muda no evento, com os nomes da sala e do palestrante
export function mudancasDoEvento(evento: Evento, salas: Sala[], palestrantes: Palestrante[]): Mudanca[] {
  const proposta = evento.proposta;
  if (!proposta) return [];
  const sala = (id: string) => salas.find((s) => s.id === id)?.nome ?? "—";
  const palestrante = (id: string) => palestrantes.find((p) => p.id === id)?.nome ?? "—";
  const mudancas: Mudanca[] = [];
  if (proposta.salaId !== evento.salaId) mudancas.push({ rotulo: "Sala", antes: sala(evento.salaId), depois: sala(proposta.salaId) });
  if (new Date(proposta.horario).getTime() !== new Date(evento.horario).getTime()) {
    mudancas.push({ rotulo: "Data/horário", antes: dataHora(evento.horario), depois: dataHora(proposta.horario) });
  }
  if (proposta.cargaHoraria !== evento.cargaHoraria) {
    mudancas.push({ rotulo: "Carga horária", antes: `${evento.cargaHoraria}h`, depois: `${proposta.cargaHoraria}h` });
  }
  if (proposta.palestranteId !== evento.palestranteId) {
    mudancas.push({ rotulo: "Palestrante", antes: palestrante(evento.palestranteId), depois: palestrante(proposta.palestranteId) });
  }
  return mudancas;
}

// o professor corrige a proposta que aguarda aprovacao, ou corrige e reenvia a recusada (com resposta opcional)
export function ModalPropostaEvento({
  evento,
  salas,
  palestrantes,
  onFechar,
  onConcluido,
}: {
  evento: Evento;
  salas: Sala[];
  palestrantes: Palestrante[];
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const proposta = evento.proposta!;
  const recusada = proposta.situacao === "RECUSADO";
  const [form, setForm] = useState({
    salaId: proposta.salaId,
    horario: isoParaInputLocal(proposta.horario),
    cargaHoraria: String(proposta.cargaHoraria),
    palestranteId: proposta.palestranteId,
    resposta: "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    const carga = Number(form.cargaHoraria);
    const novos: Record<string, string> = {};
    if (!form.horario) novos.horario = "Informe a data e o horário.";
    if (!(carga > 0)) novos.cargaHoraria = "A carga horária deve ser maior que zero.";
    setErros(novos);
    if (Object.keys(novos).length > 0) return;
    setEnviando(true);
    try {
      await aprovacaoService.editarPropostaEvento(evento.id, {
        salaId: form.salaId,
        horario: inputLocalParaIso(form.horario),
        cargaHoraria: carga,
        palestranteId: form.palestranteId,
        ...(recusada && form.resposta.trim() ? { resposta: form.resposta.trim() } : {}),
      });
      toast.success(recusada ? "Alteração reenviada para aprovação." : "Proposta de alteração corrigida.");
      avisarAprovacoesAlteradas();
      onConcluido();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLITO_DE_SALA") setErros({ horario: e.message });
      else if (e instanceof ApiError && e.code === "SALA_SEM_CAPACIDADE") setErros({ salaId: e.message });
      else if (e instanceof ApiError && e.errors?.length) setErros(Object.fromEntries(e.errors.map((item) => [item.campo, item.mensagem])));
      else toast.error(e instanceof Error ? e.message : "Não foi possível salvar a proposta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={recusada ? "Corrigir e reenviar a alteração" : "Corrigir a proposta de alteração"} onClose={onFechar}>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <p className="form-hint">
          &ldquo;{evento.titulo}&rdquo; continua valendo como está até a equipe aprovar. A sala e o horário propostos ficam
          reservados enquanto a proposta aguarda aprovação.
        </p>
        {recusada && proposta.motivoRecusa && <p className="form-hint motivo-recusa">Motivo da recusa: {proposta.motivoRecusa}</p>}
        <div className="field-row">
          <Campo nome="salaId" rotulo="Sala" obrigatorio erro={erros.salaId}>
            <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })}>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} ({s.capacidade} lugares)
                </option>
              ))}
            </select>
          </Campo>
          <Campo nome="horario" rotulo="Data/Horário" obrigatorio erro={erros.horario}>
            <input type="datetime-local" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
          </Campo>
        </div>
        <div className="field-row">
          <Campo nome="palestranteId" rotulo="Palestrante" obrigatorio erro={erros.palestranteId}>
            <select value={form.palestranteId} onChange={(e) => setForm({ ...form, palestranteId: e.target.value })}>
              {palestrantes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.situacao === "PENDENTE" ? " (aguardando aprovação)" : p.situacao === "RECUSADO" ? " (recusado)" : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo nome="cargaHoraria" rotulo="Carga horária (horas)" obrigatorio erro={erros.cargaHoraria}>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={form.cargaHoraria}
              onChange={(e) => setForm({ ...form, cargaHoraria: e.target.value })}
            />
          </Campo>
        </div>
        {recusada && (
          <Campo nome="respostaProposta" rotulo="Resposta para a equipe (opcional)">
            <textarea rows={3} maxLength={1000} value={form.resposta} onChange={(e) => setForm({ ...form, resposta: e.target.value })} />
          </Campo>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {recusada ? "Reenviar para aprovação" : "Salvar proposta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
