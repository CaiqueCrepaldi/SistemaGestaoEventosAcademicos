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

// Todo item que existe no menu, com a lista de perfis que podem vê-lo. É a
// fonte única de verdade do menu — a mesma lista é usada tanto pra desenhar
// os links quanto pra calcular a migalha de pão (useMigalhas abaixo). Não
// controla acesso por si só (isso é o ProtectedRoute em App.tsx); aqui só
// decide o que aparece ou não no menu pra cada perfil.
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

// Calcula o texto da barra de "migalha de pão" (breadcrumb) a partir da URL
// atual — ex.: "/eventos/xyz" vira ["Eventos", "Detalhe"].
function useMigalhas(menuItens: NavItem[]) {
  const location = useLocation();
  const partes = location.pathname.split("/").filter(Boolean);

  // Na tela principal (dashboard) o próprio menu já destaca "Principal" como
  // ativo — repetir o texto na migalha logo abaixo era redundante, então aqui
  // não exibimos migalha nenhuma.
  if (partes.length === 0) {
    return [];
  }

  // Acha o item de menu correspondente ao primeiro pedaço da URL, pra usar
  // o label bonito (ex.: "Eventos") em vez do path cru.
  const atual = menuItens.find((item) => item.to === `/${partes[0]}`);
  const secao = atual?.label ?? partes[0];

  // Se a URL tiver mais de um pedaço (ex.: "/eventos/xyz"), é uma tela de
  // detalhe — mostra "Eventos / Detalhe". Senão é só a seção mesmo.
  if (partes.length > 1) {
    return [secao, "Detalhe"];
  }
  return [secao];
}

export function Layout() {
  const { usuario, logout } = useAuth();
  // Filtra o menu pelo perfil de quem está logado — é aqui que o aluno
  // deixa de ver "Salas", "Participantes" etc.
  const menuItens = NAV_ITEMS.filter((item) => !usuario || item.perfis.includes(usuario.perfil));
  const migalhas = useMigalhas(menuItens);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">Gestão de Eventos Acadêmicos</span>
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
