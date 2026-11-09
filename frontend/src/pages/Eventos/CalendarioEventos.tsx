import type { KeyboardEvent } from "react";
import type { SalaOcupada } from "../../services";
import type { Evento } from "../../types";
import { chaveDoDia, eventoEncerrado, horaLocal } from "../../utils/data";

// o que aparece num dia do calendario: um evento visivel (completo) ou, pro professor, uma sala ocupada por
// evento de outro (so sala e horario)
export type ItemDoDia = { tipo: "evento"; inicio: string; evento: Evento } | { tipo: "ocupada"; inicio: string; ocupacao: SalaOcupada };

// quantos itens cabem numa celula antes do "+N"
const ITENS_POR_DIA = 3;
const DIAS_DA_SEMANA = [
  ["Dom", "Domingo"],
  ["Seg", "Segunda-feira"],
  ["Ter", "Terça-feira"],
  ["Qua", "Quarta-feira"],
  ["Qui", "Quinta-feira"],
  ["Sex", "Sexta-feira"],
  ["Sáb", "Sábado"],
] as const;

// as datas da grade do mes: comeca no domingo da primeira semana e vai ate o sabado da ultima (semanas
// inteiras), no fuso do navegador
export function diasDaGrade(ano: number, mes: number): Date[] {
  const primeiro = new Date(ano, mes, 1);
  const totalDoMes = new Date(ano, mes + 1, 0).getDate();
  const semanas = Math.ceil((primeiro.getDay() + totalDoMes) / 7);
  return Array.from({ length: semanas * 7 }, (_, i) => new Date(ano, mes, 1 - primeiro.getDay() + i));
}

// junta os eventos e as salas ocupadas por dia (chave local), cada dia em ordem de horario
export function agruparPorDia(eventos: Evento[], salasOcupadas: SalaOcupada[]): Map<string, ItemDoDia[]> {
  const itens: ItemDoDia[] = [
    ...eventos.map((evento) => ({ tipo: "evento" as const, inicio: evento.horario, evento })),
    ...salasOcupadas.map((ocupacao) => ({ tipo: "ocupada" as const, inicio: ocupacao.inicio, ocupacao })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const porDia = new Map<string, ItemDoDia[]>();
  for (const item of itens) {
    const chave = chaveDoDia(item.inicio);
    porDia.set(chave, [...(porDia.get(chave) ?? []), item]);
  }
  return porDia;
}

export function nomeDoMes(ano: number, mes: number): string {
  const texto = new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function fimDoEvento(evento: Evento): Date {
  return new Date(new Date(evento.horario).getTime() + evento.cargaHoraria * 3600 * 1000);
}

// marcacoes de um evento: cor + simbolo com texto (title/aria-label), nunca so a cor
export function marcacoesDoEvento(evento: Evento): { classe: string; simbolo: string; texto: string }[] {
  const marcas: { classe: string; simbolo: string; texto: string }[] = [];
  if (evento.situacao === "PENDENTE") marcas.push({ classe: "pendente", simbolo: "◷", texto: "Aguardando aprovação" });
  if (evento.situacao === "RECUSADO") marcas.push({ classe: "recusado", simbolo: "✕", texto: "Recusado" });
  if (evento.proposta?.situacao === "PENDENTE") marcas.push({ classe: "pendente", simbolo: "✎", texto: "Alteração aguardando aprovação" });
  if (eventoEncerrado(evento)) marcas.push({ classe: "encerrado", simbolo: "∎", texto: "Encerrado" });
  return marcas;
}

export function textoDosCheckins(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? "check-in" : "check-ins"}`;
}

function ChipDoItem({ item }: { item: ItemDoDia }) {
  if (item.tipo === "ocupada") {
    const { salaNome, inicio, fim } = item.ocupacao;
    return (
      <li className="cal-chip ocupada" title={`Sala ocupada: ${salaNome}, das ${horaLocal(inicio)} às ${horaLocal(fim)}`}>
        <span className="cal-chip-linha">
          <span className="cal-chip-hora">{horaLocal(inicio)}</span>
          <span className="cal-chip-titulo">Sala ocupada</span>
        </span>
      </li>
    );
  }
  const { evento } = item;
  const marcas = marcacoesDoEvento(evento);
  const checkins = evento.checkinsPendentes ?? 0;
  const situacao = marcas.find((m) => m.classe !== "encerrado")?.classe ?? "aprovado";
  const descricao = [
    `${horaLocal(evento.horario)} ${evento.titulo}`,
    ...marcas.map((m) => m.texto),
    ...(checkins > 0 ? [`${textoDosCheckins(checkins)} esperando aprovação`] : []),
  ].join(" · ");
  return (
    <li className={`cal-chip ${situacao}${eventoEncerrado(evento) ? " encerrado" : ""}`} title={descricao}>
      <span className="cal-chip-linha">
        <span className="cal-chip-hora">{horaLocal(evento.horario)}</span>
        <span className="cal-chip-titulo">{evento.titulo}</span>
        {marcas.map((m) => (
          <span key={m.texto} className={`cal-marca ${m.classe}`} title={m.texto} aria-label={m.texto}>
            {m.simbolo}
          </span>
        ))}
      </span>
      {checkins > 0 && (
        <span className="cal-checkins" title={`${textoDosCheckins(checkins)} esperando aprovação`}>
          {textoDosCheckins(checkins)}
        </span>
      )}
    </li>
  );
}

interface GradeDoMesProps {
  ano: number;
  mes: number;
  itensPorDia: Map<string, ItemDoDia[]>;
  diaSelecionado: string | null;
  carregando: boolean;
  onSelecionarDia: (chave: string) => void;
  onMudarMes: (delta: number) => void;
  onHoje: () => void;
}

// grade do mes: semana comecando no domingo, dias de fora do mes apagados, hoje destacado. Cada dia mostra
// ate 3 itens (horario + titulo cortado) e "+N"; em tela estreita, so um marcador por dia com evento
export function GradeDoMes({ ano, mes, itensPorDia, diaSelecionado, carregando, onSelecionarDia, onMudarMes, onHoje }: GradeDoMesProps) {
  const hoje = chaveDoDia(new Date());
  const dias = diasDaGrade(ano, mes);

  function teclado(e: KeyboardEvent<HTMLDivElement>, chave: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelecionarDia(chave);
    }
  }

  return (
    <div className="calendario">
      <div className="calendario-topo">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onMudarMes(-1)} aria-label="Mês anterior" title="Mês anterior">
          ‹
        </button>
        <h2 className="calendario-titulo" aria-live="polite">
          {nomeDoMes(ano, mes)}
        </h2>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onMudarMes(1)} aria-label="Próximo mês" title="Próximo mês">
          ›
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHoje}>
          Hoje
        </button>
        {carregando && <span className="form-hint">Carregando…</span>}
      </div>
      <div className="calendario-grade">
        {DIAS_DA_SEMANA.map(([curto, longo]) => (
          <div key={curto} className="calendario-semana" title={longo}>
            {curto}
          </div>
        ))}
        {dias.map((data) => {
          const chave = chaveDoDia(data);
          const itens = itensPorDia.get(chave) ?? [];
          const foraDoMes = data.getMonth() !== mes;
          const classes = [
            "calendario-dia",
            foraDoMes ? "fora-do-mes" : "",
            chave === hoje ? "hoje" : "",
            chave === diaSelecionado ? "selecionado" : "",
            chave < hoje ? "passado" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const rotulo = `${data.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}${chave === hoje ? " (hoje)" : ""}: ${
            itens.length === 0 ? "nenhum evento" : `${itens.length} ${itens.length === 1 ? "evento" : "eventos"}`
          }`;
          return (
            <div
              key={chave}
              className={classes}
              role="button"
              tabIndex={0}
              aria-label={rotulo}
              aria-pressed={chave === diaSelecionado}
              data-dia={chave}
              onClick={() => onSelecionarDia(chave)}
              onKeyDown={(e) => teclado(e, chave)}
            >
              <span className="calendario-dia-numero">{data.getDate()}</span>
              {itens.length > 0 && (
                <>
                  <ul className="calendario-itens">
                    {itens.slice(0, ITENS_POR_DIA).map((item, i) => (
                      <ChipDoItem key={item.tipo === "evento" ? item.evento.id : `ocupada-${i}-${item.inicio}`} item={item} />
                    ))}
                  </ul>
                  {itens.length > ITENS_POR_DIA && <span className="calendario-mais">+{itens.length - ITENS_POR_DIA}</span>}
                  <span className="calendario-marcador" aria-hidden="true" title={`${itens.length} evento(s)`} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
