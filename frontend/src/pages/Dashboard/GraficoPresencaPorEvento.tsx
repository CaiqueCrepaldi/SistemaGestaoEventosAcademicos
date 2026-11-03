import type { PresencaPorEvento } from "../../services";

interface GraficoPresencaPorEventoProps {
  eventos: PresencaPorEvento[];
}

// ordem fixa dos segmentos e da legenda: presente (verde) | pendente (cinza neutro) | ausente
// (vermelho). O cinza no meio separa verde e vermelho, que lado a lado se confundem pra quem tem
// daltonismo; legenda, numero na ponta, dica no hover e a tabela garantem que nada depende so da cor
const SEGMENTOS = [
  { chave: "presentes", classe: "presente", rotulo: "Presentes" },
  { chave: "pendentes", classe: "pendente", rotulo: "Pendentes" },
  { chave: "ausentes", classe: "ausente", rotulo: "Ausentes" },
] as const;

// espaco reservado na linha pro numero do total (ate 4 digitos) + o respiro antes dele
const ESPACO_TOTAL_PX = 40;

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// inscricoes por evento (comprimento da barra, mesma escala pra todos) divididas pela situacao do
// check-in (segmentos). Grafico em HTML/CSS puro, sem biblioteca
export function GraficoPresencaPorEvento({ eventos }: GraficoPresencaPorEventoProps) {
  if (eventos.length === 0) {
    return <p className="empty-cell">Nenhum evento cadastrado ainda.</p>;
  }

  const maiorTotal = Math.max(...eventos.map((e) => e.inscritos), 1);

  return (
    <div>
      <ul className="grafico-legenda" aria-label="Legenda">
        {SEGMENTOS.map((s) => (
          <li key={s.chave}>
            <span className={`grafico-amostra ${s.classe}`} aria-hidden="true" />
            {s.rotulo}
          </li>
        ))}
      </ul>

      <ul className="grafico-linhas list-scroll">
        {eventos.map((evento) => {
          const descricao =
            `${evento.titulo}: ${evento.inscritos} inscrições — ` +
            `${evento.presentes} presentes, ${evento.pendentes} pendentes, ${evento.ausentes} ausentes`;
          return (
            <li key={evento.id} className="grafico-linha">
              <div className="grafico-rotulo">
                {evento.titulo}
                <span>{dataCurta(evento.horario)}</span>
              </div>
              <div className="grafico-trilho" role="img" aria-label={descricao} title={descricao}>
                {/* desconta o espaco do total, que vem escrito logo depois da ponta da barra */}
                <div className="grafico-barra" style={{ width: `calc((100% - ${ESPACO_TOTAL_PX}px) * ${evento.inscritos / maiorTotal})` }}>
                  {SEGMENTOS.filter((s) => evento[s.chave] > 0).map((s) => (
                    <span
                      key={s.chave}
                      className={`grafico-segmento ${s.classe}`}
                      style={{ flexGrow: evento[s.chave], flexBasis: 0 }}
                      title={`${s.rotulo}: ${evento[s.chave]}`}
                    />
                  ))}
                </div>
                <span className="grafico-total">{evento.inscritos}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <details className="grafico-tabela">
        <summary>Ver dados em tabela</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data</th>
                <th>Inscrições</th>
                <th>Presentes</th>
                <th>Pendentes</th>
                <th>Ausentes</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{evento.titulo}</td>
                  <td>{dataCurta(evento.horario)}</td>
                  <td>{evento.inscritos}</td>
                  <td>{evento.presentes}</td>
                  <td>{evento.pendentes}</td>
                  <td>{evento.ausentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
