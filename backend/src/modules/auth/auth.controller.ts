import type { Request, Response } from "express";
import { authService } from "./auth.service";

// cadastro publico de aluno, passo 1: guarda o cadastro pendente e manda o codigo pro e-mail.
// 202 = aceito, mas a conta ainda nao existe (so depois da confirmacao)
async function registrar(req: Request, res: Response) {
  const resultado = await authService.iniciarCadastro(req.body, req.ip ?? "desconhecido");
  res.status(202).json(resultado);
}

// passo 2: confere o codigo e cria a conta
async function confirmarCadastro(req: Request, res: Response) {
  const usuario = await authService.confirmarCadastro(req.body);
  res.status(201).json(usuario);
}

// manda um codigo novo pro mesmo cadastro pendente
async function reenviarCodigoCadastro(req: Request, res: Response) {
  const resultado = await authService.reenviarCodigoCadastro(req.body, req.ip ?? "desconhecido");
  res.status(200).json(resultado);
}

// login, devolve token + dados do usuario
async function login(req: Request, res: Response) {
  const resultado = await authService.login(req.body, req.ip ?? "desconhecido");
  res.status(200).json(resultado);
}

// gera e envia o codigo de recuperacao de senha
async function solicitarRecuperacao(req: Request, res: Response) {
  const resultado = await authService.solicitarRecuperacaoSenha(req.body, req.ip ?? "desconhecido");
  res.status(200).json(resultado);
}

// confirma o codigo e troca a senha
async function confirmarRecuperacao(req: Request, res: Response) {
  await authService.confirmarRecuperacaoSenha(req.body);
  res.status(200).json({});
}

// aceita a versao vigente dos termos/politica (reaceite pedido apos mudanca de versao)
async function aceitarTermos(req: Request, res: Response) {
  await authService.aceitarTermos(req.usuario!.sub);
  res.status(204).send();
}

export const authController = {
  registrar,
  confirmarCadastro,
  reenviarCodigoCadastro,
  login, solicitarRecuperacao, confirmarRecuperacao, aceitarTermos };
