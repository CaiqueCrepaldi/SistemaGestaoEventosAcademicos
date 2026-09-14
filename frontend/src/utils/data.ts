// conversao de horario entre o form de evento e o formato trafegado/guardado (mock e http)
//
// decisao do sistema: o que o usuario digita/ve em <input type="datetime-local"> e sempre
// tratado como horario local do navegador; o valor trafegado com a api (e guardado no mock)
// e sempre um ISO-8601 com offset (aqui, UTC com sufixo "Z" — "Z" ja e um offset valido e sem
// ambiguidade). O backend faz a mesma normalizacao em eventos.schemas.ts
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
