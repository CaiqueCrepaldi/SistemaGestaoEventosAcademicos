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

// Contexto do React que guarda "quem está logado" — qualquer componente da
// árvore acessa isso via useAuth(), sem precisar passar usuário por prop.
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<SessaoUsuario | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ao abrir/recarregar a página, tenta restaurar a sessão que já estava
  // salva em localStorage — é assim que o usuário continua logado depois
  // de dar F5, sem precisar fazer login de novo.
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) setUsuario(JSON.parse(raw));
  }, []);

  async function login(email: string, senha: string) {
    setCarregando(true);
    setErro(null);
    try {
      const sessao = await authService.login(email, senha);
      setUsuario(sessao);
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    } catch (e) {
      // Guarda a mensagem de erro pra tela de login mostrar, e relança o
      // erro pra quem chamou login() (LoginPage) também saber que falhou.
      setErro(e instanceof Error ? e.message : "Erro ao autenticar");
      throw e;
    } finally {
      setCarregando(false);
    }
  }

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

// Hook de conveniência pra ler o contexto. Lança erro se for usado fora do
// AuthProvider — é um jeito de detectar esse engano cedo, em vez do
// componente simplesmente receber `undefined` sem aviso nenhum.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
