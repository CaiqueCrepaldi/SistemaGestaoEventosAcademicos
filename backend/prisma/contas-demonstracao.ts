// as tres contas de demonstracao (administrador, secretaria e professor), usadas pelo seed (prisma/seed.ts) e
// pela carga de demonstracao (scripts/carga-demonstracao.ts). Contas reais (ficticio = false): recebem e-mail,
// entram com a senha das variaveis SEED_*_SENHA e podem ativar o 2FA pela Minha conta. Nascem ativas, sem 2FA,
// com o aceite da versao vigente dos Termos registrado; o professor ja nasce ativado (sem convite pendente)
import { randomUUID } from "crypto";
import type { Perfil, PrismaClient } from "@prisma/client";
import { VERSAO_TERMOS_ATUAL } from "../src/config/termos";
import { gerarHashSenha } from "../src/utils/password";
import { MENSAGEM_REGRA_SENHA, senhaAtendeRegras } from "../src/utils/validacao";

export class SenhaDeDemonstracaoInvalida extends Error {}

export interface SenhasDeDemonstracao {
  admin: string;
  secretaria: string;
  professor: string;
}

// senha de uma conta de demonstracao: vem do .env (SEED_*_SENHA), nunca do codigo nem do log. Obrigatoria,
// sem o valor de exemplo (TROQUE) e dentro da regra de senha do sistema
function senha(variavel: string): string {
  const valor = process.env[variavel] ?? "";
  if (valor.trim() === "" || /troque/i.test(valor)) {
    throw new SenhaDeDemonstracaoInvalida(
      `${variavel} está ausente, vazia ou com o valor de exemplo. Defina uma senha no .env (ver backend/.env.example).`,
    );
  }
  if (!senhaAtendeRegras(valor)) {
    throw new SenhaDeDemonstracaoInvalida(`${variavel} não segue a regra de senha. ${MENSAGEM_REGRA_SENHA}`);
  }
  return valor;
}

// confere as tres antes de qualquer gravacao: se faltar uma, nada e tocado
export function lerSenhasDeDemonstracao(): SenhasDeDemonstracao {
  const problemas: string[] = [];
  const ler = (variavel: string) => {
    try {
      return senha(variavel);
    } catch (erro) {
      problemas.push(erro instanceof Error ? erro.message : String(erro));
      return "";
    }
  };
  const senhas = { admin: ler("SEED_ADMIN_SENHA"), secretaria: ler("SEED_SECRETARIA_SENHA"), professor: ler("SEED_PROFESSOR_SENHA") };
  if (problemas.length > 0) throw new SenhaDeDemonstracaoInvalida(problemas.join("\n"));
  return senhas;
}

export const CONTAS_DE_DEMONSTRACAO: { email: string; nome: string; perfil: Perfil; chave: keyof SenhasDeDemonstracao }[] = [
  { email: "admin@umc.br", nome: "Administrador", perfil: "ADMINISTRADOR", chave: "admin" },
  { email: "secretaria@umc.br", nome: "Secretaria", perfil: "SECRETARIA", chave: "secretaria" },
  { email: "professor@umc.br", nome: "Professor", perfil: "PROFESSOR", chave: "professor" },
];

// cria as tres contas que ainda nao existem (a que ja existe fica como esta: a senha dela nao muda). "criadaEm"
// vale pra conta e pro aceite dos Termos; "idsDesejados" fixa o id de cada conta criada (a carga de demonstracao
// ja gera os dados apontando pra eles). Devolve o id de cada uma
export async function garantirContasDeDemonstracao(
  prisma: PrismaClient,
  senhas: SenhasDeDemonstracao,
  criadaEm = new Date(),
  idsDesejados: Partial<Record<keyof SenhasDeDemonstracao, string>> = {},
): Promise<Record<keyof SenhasDeDemonstracao, string>> {
  const ids = {} as Record<keyof SenhasDeDemonstracao, string>;
  for (const conta of CONTAS_DE_DEMONSTRACAO) {
    const existente = await prisma.usuario.findUnique({ where: { emailLogin: conta.email }, select: { id: true } });
    if (existente) {
      ids[conta.chave] = existente.id;
      continue;
    }
    const criada = await prisma.usuario.create({
      data: {
        id: idsDesejados[conta.chave] ?? randomUUID(),
        nome: conta.nome,
        emailLogin: conta.email,
        senhaHash: await gerarHashSenha(senhas[conta.chave]),
        perfil: conta.perfil,
        ativo: true,
        ficticio: false,
        consentimentoLgpdEm: criadaEm,
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        criadoEm: criadaEm,
      },
    });
    ids[conta.chave] = criada.id;
  }
  return ids;
}
