// as tres contas de demonstracao (administrador, secretaria e professor), usadas pelo seed (prisma/seed.ts) e
// pela carga de demonstracao (scripts/carga-demonstracao.ts). Entram com a senha das variaveis SEED_*_SENHA e podem
// ativar o 2FA pela Minha conta. Nascem ativas, sem 2FA, com o aceite da versao vigente dos Termos registrado; o
// professor ja nasce ativado (sem convite pendente). E-mail: o do administrador vem de SEED_ADMIN_EMAIL (o e-mail de
// verdade de quem apresenta, que recebe os avisos; fica so no .env, nunca no codigo) e, sem ela, admin@umc.br.
// secretaria@umc.br e professor@umc.br nao sao caixas de ninguem da equipe: ficam sem envio de e-mail (ficticio)
import { randomUUID } from "crypto";
import type { Perfil, PrismaClient } from "@prisma/client";
import { VERSAO_TERMOS_ATUAL } from "../src/config/termos";
import { gerarHashSenha } from "../src/utils/password";
import { MENSAGEM_REGRA_SENHA, normalizarEmail, senhaAtendeRegras } from "../src/utils/validacao";

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

export interface ContaDeDemonstracao {
  email: string;
  nome: string;
  perfil: Perfil;
  chave: keyof SenhasDeDemonstracao;
  // true = o sistema nunca manda e-mail pra ela (endereco que nao e de ninguem da equipe)
  semEnvioDeEmail: boolean;
}

// e-mail do administrador de demonstracao: SEED_ADMIN_EMAIL do .env (validado) ou, sem ela, admin@umc.br
function emailDoAdministrador(): string {
  const valor = normalizarEmail(process.env.SEED_ADMIN_EMAIL ?? "");
  if (!valor) return "admin@umc.br";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    throw new SenhaDeDemonstracaoInvalida("SEED_ADMIN_EMAIL não é um e-mail válido. Corrija no .env (ver backend/.env.example).");
  }
  return valor;
}

export function contasDeDemonstracao(): ContaDeDemonstracao[] {
  const emailAdmin = emailDoAdministrador();
  return [
    { email: emailAdmin, nome: "Administrador", perfil: "ADMINISTRADOR", chave: "admin", semEnvioDeEmail: false },
    { email: "secretaria@umc.br", nome: "Secretaria", perfil: "SECRETARIA", chave: "secretaria", semEnvioDeEmail: true },
    { email: "professor@umc.br", nome: "Professor", perfil: "PROFESSOR", chave: "professor", semEnvioDeEmail: true },
  ];
}

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
  for (const conta of contasDeDemonstracao()) {
    // o e-mail de login e sempre gravado e buscado normalizado (mesma funcao do sistema)
    const emailLogin = normalizarEmail(conta.email);
    const existente = await prisma.usuario.findUnique({ where: { emailLogin }, select: { id: true } });
    if (existente) {
      ids[conta.chave] = existente.id;
      continue;
    }
    const criada = await prisma.usuario.create({
      data: {
        id: idsDesejados[conta.chave] ?? randomUUID(),
        nome: conta.nome,
        emailLogin,
        senhaHash: await gerarHashSenha(senhas[conta.chave]),
        perfil: conta.perfil,
        ativo: true,
        ficticio: conta.semEnvioDeEmail,
        consentimentoLgpdEm: criadaEm,
        versaoTermosAceitos: VERSAO_TERMOS_ATUAL,
        criadoEm: criadaEm,
      },
    });
    ids[conta.chave] = criada.id;
  }
  return ids;
}
