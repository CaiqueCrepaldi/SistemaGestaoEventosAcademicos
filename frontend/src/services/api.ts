export const SESSION_KEY = "sgea:session";

// disparado em qualquer 401 fora das rotas publicas de auth; o AuthContext escuta pra deslogar
export const SESSAO_EXPIRADA_EVENT = "sgea:sessao-expirada";

// nessas rotas um 401 eh so "e-mail ou senha errados" — nunca desloga ninguem (nem tem sessao ainda)
const ROTAS_PUBLICAS_AUTH = new Set([
  "/auth/login",
  "/auth/registro",
  "/auth/recuperacao-senha",
  "/auth/recuperacao-senha/confirmar",
]);

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

export interface ApiErrorField {
  campo: string;
  mensagem: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: ApiErrorField[];

  constructor(status: number, message: string, code?: string, errors?: ApiErrorField[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

interface ApiErrorBody {
  message?: string;
  code?: string;
  erros?: ApiErrorField[];
}

// le o token salvo na sessao, null se nao tiver ou se o json tiver corrompido
function getToken(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const sessao = JSON.parse(raw) as { token?: string };
    return sessao.token ?? null;
  } catch {
    return null;
  }
}

// sem limite a tela ficaria "carregando" pra sempre se o servidor nao respondesse
const TIMEOUT_MS = 30_000;

// faz a chamada http de verdade
async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") {
      throw new ApiError(0, "O servidor demorou demais para responder. Tente novamente.", "TIMEOUT");
    }
    throw new ApiError(0, "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.", "REDE");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : undefined;

  if (!response.ok) {
    // token vencido/invalido numa rota autenticada: limpa a sessao e avisa o AuthContext (evita
    // ciclo de import direto entre os dois arquivos). Rotas publicas de auth ficam de fora —
    // la um 401 eh so credencial errada, nunca "sessao expirada"
    if (response.status === 401 && !ROTAS_PUBLICAS_AUTH.has(path)) {
      localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event(SESSAO_EXPIRADA_EVENT));
    }

    const errorBody = payload as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      errorBody?.message ?? response.statusText,
      errorBody?.code,
      errorBody?.erros,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, "GET"),
  post: <T>(path: string, body?: unknown) => request<T>(path, "POST", body),
  put: <T>(path: string, body?: unknown) => request<T>(path, "PUT", body),
  del: <T>(path: string) => request<T>(path, "DELETE"),
};
