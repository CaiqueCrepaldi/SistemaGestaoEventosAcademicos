import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Perfil } from "../types";

const HOME_POR_PERFIL: Record<Perfil, string> = {
  ALUNO: "/eventos",
  ADMINISTRADOR: "/",
  SECRETARIA: "/",
};

interface ProtectedRouteProps {
  perfis?: Perfil[];
}

export function ProtectedRoute({ perfis }: ProtectedRouteProps) {
  const { usuario } = useAuth();

  if (!usuario) return <Navigate to="/login" replace />;
  if (perfis && !perfis.includes(usuario.perfil)) {
    return <Navigate to={HOME_POR_PERFIL[usuario.perfil]} replace />;
  }
  return <Outlet />;
}
