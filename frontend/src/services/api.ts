export const SESSION_KEY = "sgea:session";

// sem .env cai em mock por padrão
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

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

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : undefined;

  if (!response.ok) {
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
