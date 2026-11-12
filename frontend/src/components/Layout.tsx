import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { aprovacaoService, APROVACOES_ALTERADAS_EVENT, type ContadoresAprovacao } from "../services";
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
  PROFESSOR: "Professor",
};

const TODOS_PERFIS: Perfil[] = ["ADMINISTRADOR", "SECRETARIA", "ALUNO", "PROFESSOR"];
const EQUIPE: Perfil[] = ["ADMINISTRADOR", "SECRETARIA"];
// equipe + professor: as telas de gestao que o professor usa so com os eventos dele (a API filtra)
const GESTAO: Perfil[] = ["ADMINISTRADOR", "SECRETARIA", "PROFESSOR"];
const SO_ALUNO: Perfil[] = ["ALUNO"];

interface NavItem {
  to: string;
  label: string;
  // rotulo no menu do professor, quando diferente (ex.: "Certificados e notas")
  labelProfessor?: string;
  end?: boolean;
  perfis: Perfil[];
  icon: ComponentType<{ className?: string }>;
  // qual contador de pendentes aparece neste item (so pra equipe)
  contador?: keyof ContadoresAprovacao;
}

// fonte unica do menu. Professor: Dashboard, Eventos, Palestrantes, Inscricoes, Check-in, Certificados e
// notas, Avaliacoes e Minha conta (sem Salas, Participantes, Auditoria, Professores e Meus dados)
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", end: true, perfis: GESTAO, icon: DashboardIcon },
  { to: "/eventos", label: "Eventos", perfis: TODOS_PERFIS, icon: EventoIcon, contador: "eventosPendentes" },
  { to: "/salas", label: "Salas", perfis: EQUIPE, icon: SalaIcon },
  { to: "/palestrantes", label: "Palestrantes", perfis: TODOS_PERFIS, icon: PalestranteIcon, contador: "palestrantesPendentes" },
  { to: "/participantes", label: "Participantes", perfis: EQUIPE, icon: ParticipanteIcon },
  { to: "/equipe", label: "Equipe", perfis: EQUIPE, icon: ParticipanteIcon },
  { to: "/inscricoes", label: "Inscrições", perfis: GESTAO, icon: InscricaoIcon },
  { to: "/checkin", label: "Check-in", perfis: GESTAO, icon: CheckinIcon },
  // trilha de auditoria: so o administrador (a API recusa a secretaria com 403)
  { to: "/auditoria", label: "Auditoria", perfis: ["ADMINISTRADOR"], icon: AuditoriaIcon },
  { to: "/certificados", label: "Certificados", labelProfessor: "Certificados e notas", perfis: TODOS_PERFIS, icon: CertificadoIcon },
  { to: "/feedback", label: "Feedback", labelProfessor: "Avaliações", perfis: TODOS_PERFIS, icon: FeedbackIcon },
  { to: "/minha-conta", label: "Minha conta", perfis: TODOS_PERFIS, icon: ContaIcon },
  { to: "/meus-dados", label: "Meus dados", perfis: SO_ALUNO, icon: MeusDadosIcon },
];

// topbar + menu lateral, envolve toda pagina autenticada
export function Layout() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  // o clique em "Sair" pede confirmacao; a saida automatica (sessao expirada, troca de senha,
  // inativacao) chama logout() direto, sem passar por aqui
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [contadores, setContadores] = useState<ContadoresAprovacao>({});
  const menuItens = NAV_ITEMS.filter((item) => !usuario || item.perfis.includes(usuario.perfil));
  const ehEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";
  const ehProfessor = usuario?.perfil === "PROFESSOR";

  // contadores da aprovacao: a equipe ve os pendentes no menu; o professor, os recusados no topo da tela.
  // Recarrega a cada troca de tela e quando uma tela avisa que aprovou, recusou ou reenviou algo
  useEffect(() => {
    if (!ehEquipe && !ehProfessor) return;
    let descartar = false;
    const carregar = () => {
      aprovacaoService
        .contadores()
        .then((c) => {
          if (!descartar) setContadores(c);
        })
        .catch(() => {
          // contador e so conforto: sem ele a tela continua funcionando
        });
    };
    carregar();
    window.addEventListener(APROVACOES_ALTERADAS_EVENT, carregar);
    return () => {
      descartar = true;
      window.removeEventListener(APROVACOES_ALTERADAS_EVENT, carregar);
    };
  }, [ehEquipe, ehProfessor, location.pathname]);

  const recusados = (contadores.eventosRecusados ?? 0) + (contadores.palestrantesRecusados ?? 0);

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
          const quantidade = ehEquipe && item.contador ? (contadores[item.contador] ?? 0) : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <IconeItem />
              <span>
                {ehProfessor && item.labelProfessor ? item.labelProfessor : item.label}
                {quantidade > 0 && (
                  <span className="nav-contador" aria-label={`${quantidade} aguardando aprovação`} title="Aguardando aprovação">
                    {quantidade}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <main className="content">
        {ehProfessor && recusados > 0 && (
          <p className="aviso-recusados" role="status">
            {recusados === 1 ? "1 item seu foi recusado" : `${recusados} itens seus foram recusados`} pela equipe. Veja o motivo,
            corrija e reenvie em{" "}
            {(contadores.eventosRecusados ?? 0) > 0 && <Link to="/eventos">Eventos</Link>}
            {(contadores.eventosRecusados ?? 0) > 0 && (contadores.palestrantesRecusados ?? 0) > 0 && " e "}
            {(contadores.palestrantesRecusados ?? 0) > 0 && <Link to="/palestrantes">Palestrantes</Link>}.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
