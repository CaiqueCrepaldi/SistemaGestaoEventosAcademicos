import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Perfil } from "../types";

const PERFIL_LABEL: Record<Perfil, string> = {
  ADMINISTRADOR: "Administrador",
  SECRETARIA: "Secretaria",
  ALUNO: "Aluno",
};

const TODOS_PERFIS: Perfil[] = ["ADMINISTRADOR", "SECRETARIA", "ALUNO"];
const EQUIPE: Perfil[] = ["ADMINISTRADOR", "SECRETARIA"];

const NAV_ITEMS: { to: string; label: string; end?: boolean; perfis: Perfil[] }[] = [
  { to: "/", label: "Dashboard", end: true, perfis: EQUIPE },
  { to: "/eventos", label: "Eventos", perfis: TODOS_PERFIS },
  { to: "/sessoes", label: "Sessões", perfis: EQUIPE },
  { to: "/salas", label: "Salas", perfis: EQUIPE },
  { to: "/palestrantes", label: "Palestrantes", perfis: TODOS_PERFIS },
  { to: "/participantes", label: "Participantes", perfis: EQUIPE },
  { to: "/inscricoes", label: "Inscrições", perfis: EQUIPE },
  { to: "/checkin", label: "Check-in", perfis: EQUIPE },
  { to: "/agenda", label: "Agenda", perfis: TODOS_PERFIS },
  { to: "/trabalhos", label: "Trabalhos", perfis: EQUIPE },
  { to: "/certificados", label: "Certificados", perfis: TODOS_PERFIS },
  { to: "/feedback", label: "Feedback", perfis: TODOS_PERFIS },
];

export function Layout() {
  const { usuario, logout } = useAuth();
  const menuItens = NAV_ITEMS.filter((item) => !usuario || item.perfis.includes(usuario.perfil));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">SGEA</span>
          <span className="sidebar-brand-sub">Gestão de Eventos Acadêmicos</span>
        </div>
        <nav className="sidebar-nav">
          {menuItens.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div />
          <div className="topbar-user">
            <div className="topbar-user-info">
              <strong>{usuario?.nome}</strong>
              <span>{usuario ? PERFIL_LABEL[usuario.perfil] : ""}</span>
            </div>
            <button className="btn btn-ghost" onClick={logout}>
              Sair
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
