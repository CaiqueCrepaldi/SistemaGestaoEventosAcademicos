import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SESSION_KEY } from "../services/api";
import { authService, type SessaoUsuario } from "../services/authService";

interface AuthContextValue {
  usuario: SessaoUsuario | null;
  carregando: boolean;
  erro: string | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// guarda quem esta logado e expoe login/logout pro resto do app via useAuth()
export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) setUsuario(JSON.parse(raw));
  }, []);

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

  // limpa sessao do estado e do localStorage
  function logout() {
    setUsuario(null);
    localStorage.removeItem(SESSION_KEY);
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
