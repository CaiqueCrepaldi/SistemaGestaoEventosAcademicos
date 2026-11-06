import { useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  AuditoriaIcon,
  CertificadoIcon,
  CheckinIcon,
  ContaIcon,
  DashboardIcon,
  EventoIcon,
  FeedbackIcon,
  InscricaoIcon,
  MeusDadosIcon,
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
const SO_ALUNO: Perfil[] = ["ALUNO"];

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  perfis: Perfil[];
  icon: ComponentType<{ className?: string }>;
}

// fonte unica do menu
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", end: true, perfis: EQUIPE, icon: DashboardIcon },
  { to: "/eventos", label: "Eventos", perfis: TODOS_PERFIS, icon: EventoIcon },
  { to: "/salas", label: "Salas", perfis: EQUIPE, icon: SalaIcon },
  { to: "/palestrantes", label: "Palestrantes", perfis: TODOS_PERFIS, icon: PalestranteIcon },
  { to: "/participantes", label: "Participantes", perfis: EQUIPE, icon: ParticipanteIcon },
  { to: "/inscricoes", label: "Inscrições", perfis: EQUIPE, icon: InscricaoIcon },
  { to: "/checkin", label: "Check-in", perfis: EQUIPE, icon: CheckinIcon },
  { to: "/auditoria", label: "Auditoria", perfis: EQUIPE, icon: AuditoriaIcon },
  { to: "/certificados", label: "Certificados", perfis: TODOS_PERFIS, icon: CertificadoIcon },
  { to: "/feedback", label: "Feedback", perfis: TODOS_PERFIS, icon: FeedbackIcon },
  { to: "/minha-conta", label: "Minha conta", perfis: TODOS_PERFIS, icon: ContaIcon },
  { to: "/meus-dados", label: "Meus dados", perfis: SO_ALUNO, icon: MeusDadosIcon },
];

// topbar + menu lateral, envolve toda pagina autenticada
export function Layout() {
  const { usuario, logout } = useAuth();
  // o clique em "Sair" pede confirmacao; a saida automatica (sessao expirada, troca de senha,
  // inativacao) chama logout() direto, sem passar por aqui
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
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
          <div className="topbar-user-info">
            <strong>{usuario?.nome}</strong>
            <span>{usuario ? PERFIL_LABEL[usuario.perfil] : ""}</span>
          </div>
          <button className="btn btn-ghost" onClick={() => setConfirmandoSaida(true)}>
            Sair
          </button>
        </div>
      </header>

      {confirmandoSaida && (
        <ConfirmDialog
          title="Sair do sistema?"
          message="Você vai precisar entrar de novo com seu e-mail e senha."
          confirmLabel="Sair"
          cancelLabel="Cancelar"
          onConfirm={() => {
            setConfirmandoSaida(false);
            logout();
          }}
          onCancel={() => setConfirmandoSaida(false)}
        />
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
