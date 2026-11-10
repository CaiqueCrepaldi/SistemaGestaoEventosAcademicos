import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/AppError";
import { registrarAuditoria } from "../../utils/auditoria";
import { chaveConta, estaBloqueado, incrementarTentativa, limparTentativas } from "../../utils/limiteAcesso";
import { conferirSenha, gerarHashSenha } from "../../utils/password";
import { emailService, observacaoDoEnvio } from "../email/email.service";
import { mfaService } from "../mfa/mfa.service";
import { COM_RGM, emitirSessao } from "./auth.service";
import type { AlterarSenhaInput } from "./auth.schemas";

// troca de senha pelo proprio titular na Minha Conta (qualquer perfil). O usuario vem SEMPRE do token
// (usuarioId), nunca de um id mandado pela tela. Regra de formato, nova != atual e confirmacao ficam no
// alterarSenhaSchema; aqui ficam a senha atual, o 2FA, o limite de tentativas e os efeitos da troca

function chaveTrocaSenha(usuarioId: string): string {
  return chaveConta("troca-senha", usuarioId);
}

// mesma mensagem pra senha atual errada e codigo errado: nao diz qual dos dois falhou
function erroCredenciais(): AppError {
  return new AppError(422, "SENHA_ATUAL_OU_CODIGO_INVALIDOS", "Senha atual ou código incorretos.");
}

async function registrarFalha(usuarioId: string, motivo: string) {
  await registrarAuditoria(usuarioId, "SENHA_ALTERACAO_FALHA", motivo);
  await incrementarTentativa(chaveTrocaSenha(usuarioId));
  if (await estaBloqueado(chaveTrocaSenha(usuarioId))) {
    await registrarAuditoria(usuarioId, "SENHA_ALTERACAO_FALHA", "limite de tentativas atingido; bloqueado por 15 minutos");
  }
}

async function alterarSenha(usuarioId: string, dados: AlterarSenhaInput) {
  if (await estaBloqueado(chaveTrocaSenha(usuarioId))) {
    await registrarAuditoria(usuarioId, "SENHA_ALTERACAO_FALHA", "bloqueado temporariamente (limite de tentativas)");
    throw new AppError(429, "MUITAS_TENTATIVAS", "Muitas tentativas. Tente novamente em alguns minutos.");
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw AppError.naoAutenticado();

  // com o 2FA ativo o codigo e obrigatorio: falta de codigo e erro de preenchimento, nao tentativa errada
  if (usuario.mfaAtivo && !dados.codigo && !dados.codigoRecuperacao) {
    throw AppError.validacao("Dados inválidos.", [
      { campo: "codigo", mensagem: "Informe o código do aplicativo autenticador ou um código de recuperação." },
    ]);
  }

  // senha atual errada nem chega a conferir o codigo (nao gasta o codigo certo nem um codigo de recuperacao)
  if (!(await conferirSenha(dados.senhaAtual, usuario.senhaHash))) {
    await registrarFalha(usuarioId, "senha atual incorreta");
    throw erroCredenciais();
  }

  let confirmacao2fa = "";
  if (usuario.mfaAtivo) {
    const segundoFator = await mfaService.conferirSegundoFator(usuario, dados);
    if (!segundoFator.ok) {
      await registrarFalha(usuarioId, segundoFator.motivo);
      throw erroCredenciais();
    }
    confirmacao2fa = segundoFator.usouRecuperacao ? "; 2FA confirmado com código de recuperação" : "; 2FA confirmado pelo aplicativo";
  }
  await limparTentativas(chaveTrocaSenha(usuarioId));

  const alteradaEm = new Date();
  const novaSenhaHash = await gerarHashSenha(dados.novaSenha);
  const [atualizado, recuperacoes] = await prisma.$transaction([
    // versaoToken + 1 derruba todas as sessoes abertas; a de quem trocou e reemitida na resposta
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash: novaSenhaHash, versaoToken: { increment: 1 } },
      include: { participante: { select: COM_RGM } },
    }),
    // codigo de "Esqueci minha senha" pedido antes da troca deixa de valer
    prisma.recuperacaoSenha.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: alteradaEm } }),
  ]);
  await registrarAuditoria(
    usuarioId,
    "SENHA_ALTERADA",
    `senha alterada pelo próprio titular; outras sessões encerradas${confirmacao2fa}` +
      (recuperacoes.count > 0 ? `; ${recuperacoes.count} código(s) de recuperação de senha invalidado(s)` : ""),
  );

  // o aviso e so informativo: se o envio falhar, a troca continua valendo e a falha fica na auditoria
  try {
    const resultado = await emailService.enviarAvisoSenhaAlterada(atualizado.emailLogin, alteradaEm);
    await registrarAuditoria(usuarioId, "EMAIL_ENVIADO", `aviso de senha alterada, usuário ${usuarioId}${observacaoDoEnvio(resultado)}`);
  } catch {
    console.error("[troca-senha] falha ao enviar o aviso de senha alterada");
    await registrarAuditoria(usuarioId, "EMAIL_FALHA", `aviso de senha alterada, usuário ${usuarioId}: falha no envio`);
  }

  return emitirSessao(atualizado);
}

export const trocaSenhaService = { alterarSenha, chaveTrocaSenha };
