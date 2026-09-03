import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Perfil } from "../types";

// Pra onde mandar cada perfil quando ele tenta acessar uma rota que não é
// permitida pra ele (ex.: aluno digitando /participantes na mão).
const HOME_POR_PERFIL: Record<Perfil, string> = {
  ALUNO: "/eventos",
  ADMINISTRADOR: "/",
  SECRETARIA: "/",
};

interface ProtectedRouteProps {
  perfis?: Perfil[];
}

// Guarda de rota usada duas vezes no App.tsx: uma vez sem `perfis` (só
// exige estar logado, embrulha o Layout inteiro) e várias vezes com
// `perfis` (restringe um grupo de rotas a perfis específicos). Funciona
// tanto pra clique no menu quanto pra digitação direta da URL, porque a
// checagem acontece aqui, antes de qualquer página renderizar.
export function ProtectedRoute({ perfis }: ProtectedRouteProps) {
  const { usuario } = useAuth();

  // Sem sessão nenhuma: manda pro login, não importa qual rota foi pedida.
  if (!usuario) return <Navigate to="/login" replace />;

  // Logado, mas essa rota exige um perfil que o usuário não tem: manda pra
  // "casa" dele (não pro login de novo, já que ele está autenticado).
  if (perfis && !perfis.includes(usuario.perfil)) {
    return <Navigate to={HOME_POR_PERFIL[usuario.perfil]} replace />;
  }

  // Passou nas duas checagens: renderiza a rota filha normalmente.
  return <Outlet />;
}
