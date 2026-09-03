export interface ErroDeCampo {
  campo: string;
  mensagem: string;
}

// Erro padrão de toda a API — o mesmo formato documentado em
// docs/api-contract.md (timestamp/status/code/message/path, com `erros`
// opcional pra validação por campo). Toda rota que precisa recusar uma
// requisição por um motivo esperado (não achou, sem permissão, duplicado
// etc.) lança um AppError; o middleware de erro (errorHandler.ts) é quem
// transforma isso na resposta HTTP de verdade.
export class AppError extends Error {
  status: number;
  code: string;
  errors?: ErroDeCampo[];

  constructor(status: number, code: string, message: string, errors?: ErroDeCampo[]) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  // Atalhos pros erros mais comuns, pra não repetir "new AppError(401, ...)"
  // com os mesmos três primeiros argumentos em toda rota.
  static naoAutenticado(mensagem = "Token ausente, inválido ou expirado."): AppError {
    return new AppError(401, "NAO_AUTENTICADO", mensagem);
  }

  static acessoNegado(mensagem = "Você não tem permissão para acessar este recurso."): AppError {
    return new AppError(403, "ACESSO_NEGADO", mensagem);
  }

  static naoEncontrado(code: string, mensagem: string): AppError {
    return new AppError(404, code, mensagem);
  }

  static validacao(mensagem: string, errors?: ErroDeCampo[]): AppError {
    return new AppError(422, "VALIDACAO", mensagem, errors);
  }

  static conflito(code: string, mensagem: string): AppError {
    return new AppError(409, code, mensagem);
  }
}
