export interface ErroDeCampo {
  campo: string;
  mensagem: string;
}

// erro padrao da api, formato timestamp/status/code/message/path
// os services lançam isso quando precisam recusar uma requisição
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
