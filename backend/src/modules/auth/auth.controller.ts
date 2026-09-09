import type { Request, Response } from "express";
import { authService } from "./auth.service";

// cadastro publico de aluno
async function registrar(req: Request, res: Response) {
  const usuario = await authService.registrarAluno(req.body);
  res.status(201).json(usuario);
}

// login, devolve token + dados do usuario
async function login(req: Request, res: Response) {
  const resultado = await authService.login(req.body);
  res.status(200).json(resultado);
}

// gera e envia o codigo de recuperacao de senha
async function solicitarRecuperacao(req: Request, res: Response) {
  const resultado = await authService.solicitarRecuperacaoSenha(req.body);
  res.status(200).json(resultado);
}

// confirma o codigo e troca a senha
async function confirmarRecuperacao(req: Request, res: Response) {
  await authService.confirmarRecuperacaoSenha(req.body);
  res.status(200).json({});
}

export const authController = { registrar, login, solicitarRecuperacao, confirmarRecuperacao };
