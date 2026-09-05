import type { ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  AgendaIcon,
  CertificadoIcon,
  CheckinIcon,
  DashboardIcon,
  EventoIcon,
  FeedbackIcon,
  InscricaoIcon,
  PalestranteIcon,
  ParticipanteIcon,
  SalaIcon,
} from "./ui/icons";
import type { Perfil } from "../types";

const PERFIL_LABEL: Record<Perfil, string> = {
  ADMINISTRADOR: "Administrador",
  SECRETARIA: "Secretaria",
  ALUNO: "Aluno",
};

const TODOS_PERFIS: Perfil[] = ["ADMINISTRADOR", "SECRETARIA", "ALUNO"];
const EQUIPE: Perfil[] = ["ADMINISTRADOR", "SECRETARIA"];

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  perfis: Perfil[];
  icon: ComponentType<{ className?: string }>;
}

// fonte unica do menu, usada tanto pros links quanto pra migalha de pao abaixo
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Principal", end: true, perfis: EQUIPE, icon: DashboardIcon },
  { to: "/eventos", label: "Eventos", perfis: TODOS_PERFIS, icon: EventoIcon },
  { to: "/salas", label: "Salas", perfis: EQUIPE, icon: SalaIcon },
  { to: "/palestrantes", label: "Palestrantes", perfis: TODOS_PERFIS, icon: PalestranteIcon },
  { to: "/participantes", label: "Participantes", perfis: EQUIPE, icon: ParticipanteIcon },
  { to: "/inscricoes", label: "Inscrições", perfis: EQUIPE, icon: InscricaoIcon },
  { to: "/checkin", label: "Check-in", perfis: EQUIPE, icon: CheckinIcon },
  { to: "/agenda", label: "Agenda", perfis: TODOS_PERFIS, icon: AgendaIcon },
  { to: "/certificados", label: "Certificados", perfis: TODOS_PERFIS, icon: CertificadoIcon },
  { to: "/feedback", label: "Feedback", perfis: TODOS_PERFIS, icon: FeedbackIcon },
];

function useMigalhas(menuItens: NavItem[]) {
  const location = useLocation();
  const partes = location.pathname.split("/").filter(Boolean);

  if (partes.length === 0) {
    return [];
  }

  const atual = menuItens.find((item) => item.to === `/${partes[0]}`);
  const secao = atual?.label ?? partes[0];

  if (partes.length > 1) {
    return [secao, "Detalhe"];
  }
  return [secao];
}

export function Layout() {
  const { usuario, logout } = useAuth();
  const menuItens = NAV_ITEMS.filter((item) => !usuario || item.perfis.includes(usuario.perfil));
  const migalhas = useMigalhas(menuItens);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">UMC · Gestão de Eventos Acadêmicos</span>
        </div>
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

      <nav className="main-nav">
        {menuItens.map((item) => {
          const IconeItem = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <IconeItem />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {migalhas.length > 0 && (
        <div className="breadcrumb-bar">
          {migalhas.map((parte, i) => (
            <span key={i}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              {parte}
            </span>
          ))}
        </div>
      )}

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
