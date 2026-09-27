import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SESSAO_EXPIRADA_EVENT, SESSION_KEY } from "../services/api";
import { authService, type SessaoUsuario } from "../services/authService";

// mostrada na tela de login quando o logout nao foi um clique em "Sair" (ver logout() abaixo)
export const MENSAGEM_SESSAO_EXPIRADA = "Sua sessão expirou. Entre novamente.";

interface AuthContextValue {
  usuario: SessaoUsuario | null;
  carregando: boolean;
  erro: string | null;
  login: (email: string, senha: string) => Promise<void>;
  // sem argumento (botao "Sair") nao mostra mensagem nenhuma; com argumento, a mensagem
  // fica visivel na tela de login (usado pelo aviso de sessao expirada, ver useEffect abaixo)
  logout: (mensagem?: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// le a sessao salva, descartando se o token ja venceu — evita reabrir o app "logado" com token morto
function sessaoSalvaValida(): SessaoUsuario | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const sessao = JSON.parse(raw) as SessaoUsuario;
    return sessao.expiraEm > Date.now() ? sessao : null;
  } catch {
    return null;
  }
}

// guarda quem esta logado e expoe login/logout pro resto do app via useAuth()
export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // limpa sessao do estado e do localStorage; usado tanto pelo "Sair" manual quanto pelo token
  // expirado/invalido (evento global de 401 em services/api.ts, ou a checagem proativa de
  // expiracao em ProtectedRoute, que roda a cada troca de rota antes de qualquer chamada)
  const logout = useCallback((mensagem?: string) => {
    setUsuario(null);
    localStorage.removeItem(SESSION_KEY);
    setErro(mensagem ?? null);
  }, []);

  // carregamento do app: se a sessao salva ja venceu, nem chega a logar — descarta direto
  useEffect(() => {
    const sessao = sessaoSalvaValida();
    if (sessao) setUsuario(sessao);
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    function aoExpirar() {
      logout(MENSAGEM_SESSAO_EXPIRADA);
    }
    window.addEventListener(SESSAO_EXPIRADA_EVENT, aoExpirar);
    return () => window.removeEventListener(SESSAO_EXPIRADA_EVENT, aoExpirar);
  }, [logout]);

  // chama o authService, guarda a sessao no estado e no localStorage
  async function login(email: string, senha: string) {
    setCarregando(true);
    setErro(null);
    try {
      const sessao = await authService.login(email, senha);
      setUsuario(sessao);
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao autenticar");
      throw e;
    } finally {
      setCarregando(false);
    }
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, erro, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// hook de acesso ao contexto, estoura erro se usado fora do AuthProvider
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
