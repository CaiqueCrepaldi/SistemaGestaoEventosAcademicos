import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { MENSAGEM_SESSAO_EXPIRADA, useAuth } from "../context/AuthContext";
import type { Perfil } from "../types";

const HOME_POR_PERFIL: Record<Perfil, string> = {
  ALUNO: "/eventos",
  ADMINISTRADOR: "/",
  SECRETARIA: "/",
};

interface ProtectedRouteProps {
  perfis?: Perfil[];
}

// sem perfis so exige login, com perfis restringe um grupo de rotas
export function ProtectedRoute({ perfis }: ProtectedRouteProps) {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const expirado = Boolean(usuario && usuario.expiraEm <= Date.now());

  // a cada troca de rota, se o token ja venceu, desloga antes da pagina de destino chegar a
  // fazer qualquer chamada (em vez de esperar ela tomar 401 pra so entao sair da tela)
  useEffect(() => {
    if (expirado) logout(MENSAGEM_SESSAO_EXPIRADA);
  }, [location.pathname, expirado, logout]);

  if (!usuario || expirado) return <Navigate to="/login" replace />;

  if (perfis && !perfis.includes(usuario.perfil)) {
    return <Navigate to={HOME_POR_PERFIL[usuario.perfil]} replace />;
  }

  return <Outlet />;
}
