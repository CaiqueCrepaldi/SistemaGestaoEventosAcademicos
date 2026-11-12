import type { Sala, TipoSala } from "../types";

// codigo de sala no padrao da UMC: predio (1, 2 ou 3) + andar (T = terreo, 1, 2 ou 3) + "-" + numero de 01 a 21.
// Ex.: 1T-01 (predio 1, terreo, sala 01), 22-07, 33-21. A mesma regra esta em backend/src/utils/salas.ts (a API
// valida de novo)
export const REGEX_CODIGO_SALA = /^[1-3][T1-3]-(0[1-9]|1[0-9]|2[01])$/;

export const PREDIOS = ["1", "2", "3"] as const;
export const ANDARES = [
  { valor: "T", rotulo: "Térreo" },
  { valor: "1", rotulo: "1º andar" },
  { valor: "2", rotulo: "2º andar" },
  { valor: "3", rotulo: "3º andar" },
] as const;
export const NUMEROS = Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, "0"));

export const TIPOS_SALA: { valor: TipoSala; rotulo: string }[] = [
  { valor: "SALA_DE_AULA", rotulo: "Sala de aula" },
  { valor: "LABORATORIO", rotulo: "Laboratório" },
  { valor: "AUDITORIO", rotulo: "Auditório" },
];

export function rotuloTipoSala(tipo: TipoSala | undefined): string {
  return TIPOS_SALA.find((t) => t.valor === tipo)?.rotulo ?? "Sala de aula";
}

// como a sala aparece na tela: "1T-01 · Laboratório"
export function rotuloSala(sala: Pick<Sala, "nome" | "tipo"> | undefined | null): string {
  if (!sala) return "—";
  return `${sala.nome} · ${rotuloTipoSala(sala.tipo)}`;
}

export function montarCodigoSala(predio: string, andar: string, numero: string): string {
  return `${predio}${andar}-${numero}`;
}

// partes do codigo pra preencher as tres selecoes na edicao; codigo fora do padrao (sala antiga) volta vazio
export function partesDoCodigo(codigo: string): { predio: string; andar: string; numero: string } {
  if (!REGEX_CODIGO_SALA.test(codigo)) return { predio: "", andar: "", numero: "" };
  return { predio: codigo[0], andar: codigo[1], numero: codigo.slice(3) };
}

// ordem por predio, andar (terreo antes do 1) e numero; codigo fora do padrao vai pro fim
function chaveDeOrdem(nome: string): string {
  if (!REGEX_CODIGO_SALA.test(nome)) return `9${nome}`;
  return `${nome[0]}${nome[1] === "T" ? "0" : nome[1]}${nome.slice(3)}`;
}

export function ordenarSalas<T extends { nome: string }>(salas: T[]): T[] {
  return [...salas].sort((a, b) => chaveDeOrdem(a.nome).localeCompare(chaveDeOrdem(b.nome)));
}
