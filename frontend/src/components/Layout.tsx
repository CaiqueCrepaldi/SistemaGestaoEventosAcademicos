import { useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Modal } from "./ui/Modal";
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

// fonte unica do menu
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

// topbar + menu lateral, envolve toda pagina autenticada
export function Layout() {
  const { usuario, logout } = useAuth();
  const [perfilAberto, setPerfilAberto] = useState(false);
  const menuItens = NAV_ITEMS.filter((item) => !usuario || item.perfis.includes(usuario.perfil));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">
            <span className="brand-accent">UMC</span> · Gestão de Eventos Acadêmicos
          </span>
        </div>
        <div className="topbar-user">
          <button
            type="button"
            className="topbar-user-trigger"
            onClick={() => setPerfilAberto(true)}
            aria-label="Ver informações do usuário"
          >
            <div className="topbar-user-info">
              <strong>{usuario?.nome}</strong>
              <span>{usuario ? PERFIL_LABEL[usuario.perfil] : ""}</span>
            </div>
          </button>
          <button className="btn btn-ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      {perfilAberto && usuario && (
        <Modal title="Informações do usuário" onClose={() => setPerfilAberto(false)}>
          <div className="profile-details">
            <div className="profile-detail">
              <span>Nome</span>
              <strong>{usuario.nome}</strong>
            </div>
            <div className="profile-detail">
              <span>E-mail</span>
              <strong>{usuario.emailLogin}</strong>
            </div>
            <div className="profile-detail">
              <span>Perfil</span>
              <strong>{PERFIL_LABEL[usuario.perfil]}</strong>
            </div>
            <div className="profile-detail">
              <span>RGM</span>
              <strong>{usuario.rgm ?? "Não informado"}</strong>
            </div>
          </div>
          <p className="form-hint profile-note">
            Para alterar seus dados, entre em contato com a secretaria ou com a administração.
          </p>
        </Modal>
      )}

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

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
