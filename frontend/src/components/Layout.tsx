import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Perfil } from "../types";

const PERFIL_LABEL: Record<Perfil, string> = {
  ADMINISTRADOR: "Administrador",
  SECRETARIA: "Secretaria",
  ALUNO: "Aluno",
};

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/eventos", label: "Eventos" },
  { to: "/sessoes", label: "Sessões" },
  { to: "/salas", label: "Salas" },
  { to: "/palestrantes", label: "Palestrantes" },
  { to: "/participantes", label: "Participantes" },
  { to: "/inscricoes", label: "Inscrições" },
  { to: "/checkin", label: "Check-in" },
  { to: "/agenda", label: "Agenda" },
  { to: "/trabalhos", label: "Trabalhos" },
  { to: "/feedback", label: "Feedback" },
];

export function Layout() {
  const { usuario, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">SGEA</span>
          <span className="sidebar-brand-sub">Gestão de Eventos Acadêmicos</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
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
