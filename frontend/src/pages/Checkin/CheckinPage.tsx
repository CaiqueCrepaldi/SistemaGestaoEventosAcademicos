import { useCallback, useEffect, useState } from "react";
import { PainelCheckins } from "../../components/checkin/PainelCheckins";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { ApiError, checkinService, type EventoCheckin } from "../../services";
import { dataHora } from "../../utils/presenca";

// tela Check-in: a equipe e o professor nao marcam mais presenca direto. O aluno pede o check-in pela
// tela dele e aqui aparecem os eventos com a janela aberta (1 hora antes do inicio ate 24 horas depois
// do fim) que o perfil enxerga — o professor so os dele —, com quantos pedidos esperam decisao. Clicar
// no evento abre o painel "Check-ins"
export function CheckinPage() {
  const [eventos, setEventos] = useState<EventoCheckin[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await checkinService.eventosAbertos();
      setEventos(lista);
      setErro(null);
      // o evento aberto no painel saiu da lista (a janela fechou): fecha o painel
      setSelecionado((atual) => (atual && lista.some((e) => e.id === atual) ? atual : null));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível carregar os eventos.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const eventoSelecionado = eventos?.find((e) => e.id === selecionado);

  return (
    <div>
      <PageHeader
        title="Check-in"
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => void carregar()}>
            Atualizar
          </button>
        }
      />
      <p className="form-hint" style={{ marginBottom: 12 }}>
        O aluno pede o check-in na tela dele quando chega ao evento. Aqui você aprova ou recusa os pedidos dos eventos com o
        check-in aberto (de 1 hora antes do início até 24 horas depois do fim).
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>Eventos com check-in aberto</h3>
          <ul className="simple-list list-scroll">
            {!eventos && !erro && <li className="empty-cell">Carregando eventos…</li>}
            {erro && (
              <li className="empty-cell" role="alert">
                <p className="form-error" style={{ marginBottom: 10 }}>
                  {erro}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => void carregar()}>
                  Tentar novamente
                </button>
              </li>
            )}
            {eventos?.map((evento) => (
              <li
                key={evento.id}
                className={"simple-list-item clickable" + (selecionado === evento.id ? " selected" : "")}
                onClick={() => setSelecionado(evento.id)}
              >
                <div className="simple-list-item-row">
                  <div className="simple-list-title">{evento.titulo}</div>
                  {evento.solicitados > 0 ? (
                    <Badge tone="orange">{`${evento.solicitados} pedido(s) pendente(s)`}</Badge>
                  ) : (
                    <Badge tone="neutral">Sem pedidos pendentes</Badge>
                  )}
                </div>
                <div className="simple-list-sub">
                  {dataHora(evento.horario)} · {evento.salaNome} · {evento.presentes} presente(s) de {evento.inscritos} inscrito(s)
                </div>
              </li>
            ))}
            {eventos && eventos.length === 0 && <li className="empty-cell">Nenhum evento com o check-in aberto agora.</li>}
          </ul>
        </div>

        <div className="card">
          <h3>{eventoSelecionado ? `Check-ins de ${eventoSelecionado.titulo}` : "Selecione um evento"}</h3>
          {selecionado && <PainelCheckins eventoId={selecionado} onAlterado={() => void carregar()} />}
        </div>
      </div>
    </div>
  );
}
