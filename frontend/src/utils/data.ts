// conversao de horario entre o form de evento e o formato trafegado com a api
//
// decisao do sistema: o que o usuario digita/ve em <input type="datetime-local"> e sempre
// tratado como horario local do navegador; o valor trafegado com a api e sempre um ISO-8601
// com offset (aqui, UTC com sufixo "Z" — "Z" ja e um offset valido e sem ambiguidade). O
// backend faz a mesma normalizacao em eventos.schemas.ts
// (z.coerce.date().transform(d => d.toISOString())), entao os dois lados concordam.

// ISO-8601 (com "Z" ou offset explicito) -> valor aceito por <input type="datetime-local">,
// no fuso local do navegador. String vazia/invalida vira "" (input fica em branco)
export function isoParaInputLocal(iso: string): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return (
    `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}` +
    `T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
  );
}

// valor naive de <input type="datetime-local"> (sem timezone, fuso local do navegador) ->
// ISO-8601 UTC. new Date(valor) sem offset explicito e interpretado pelo motor JS como
// horario local de quem esta rodando o codigo — aqui sempre o navegador, nunca o servidor
export function inputLocalParaIso(valor: string): string {
  if (!valor) return "";
  return new Date(valor).toISOString();
}

// dia no fuso do navegador ("2026-11-05"), a chave de cada dia no calendario. Fatiar a ISO (UTC) jogaria o
// evento das 21h em diante pro dia seguinte
export function chaveDoDia(data: Date | string): string {
  const d = typeof data === "string" ? new Date(data) : data;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-11-05" -> meia-noite desse dia no fuso do navegador
export function dataDaChave(chave: string): Date {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// "14:00" no fuso do navegador
export function horaLocal(data: Date | string): string {
  return new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// evento encerrado = horario + carga horaria (em horas) ja passou. Mesma regra do backend: depois disso
// ninguem edita nem exclui o evento (a API responde 409 EVENTO_ENCERRADO), entao a tela esconde os botoes
export function eventoEncerrado(evento: { horario: string; cargaHoraria: number }, agora = Date.now()): boolean {
  return new Date(evento.horario).getTime() + evento.cargaHoraria * 3600 * 1000 <= agora;
}
