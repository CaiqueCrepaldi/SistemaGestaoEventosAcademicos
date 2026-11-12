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
const SEM_PROFESSOR: Perfil[] = ["ADMINISTRADOR", "SECRETARIA", "ALUNO"];

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  perfis: Perfil[];
  icon: ComponentType<{ className?: string }>;
  // qual contador de pendentes aparece neste item (so pra equipe)
  contador?: "eventosPendentes" | "palestrantesPendentes";
}

// fonte unica do menu, com o mesmo nome de cada tela pra todos os perfis. Professor: Dashboard, Eventos, Palestrantes,
// Inscricoes, Check-in e Minha conta (sem Salas, Participantes, Equipe, Auditoria, Certificados, Avaliacoes e Meus dados)
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
  // certificados e avaliacoes: aluno e equipe; o professor nao ve (a API recusa com 403)
  { to: "/certificados", label: "Certificados", perfis: SEM_PROFESSOR, icon: CertificadoIcon },
  { to: "/feedback", label: "Avaliações", perfis: SEM_PROFESSOR, icon: FeedbackIcon },
  { to: "/minha-conta", label: "Minha conta", perfis: TODOS_PERFIS, icon: ContaIcon },
  { to: "/meus-dados", label: "Meus dados", perfis: SO_ALUNO, icon: MeusDadosIcon },
];

// aviso de recusa do professor: as recusas que ele ja viu e fechou no X ficam no navegador, por usuario. A API
// manda um id por recusa em aberto (recusar de novo um item gera outro id), entao o aviso volta so quando chega
// uma recusa nova. Sem localStorage (navegacao privada, armazenamento bloqueado), o aviso fica fechado so ate
// recarregar a pagina
const chaveRecusasVistas = (usuarioId: string) => `sgea:recusas-vistas:${usuarioId}`;

function lerRecusasVistas(usuarioId: string | undefined): string[] {
  if (!usuarioId) return [];
  try {
    const lido: unknown = JSON.parse(localStorage.getItem(chaveRecusasVistas(usuarioId)) ?? "[]");
    return Array.isArray(lido) ? lido.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function gravarRecusasVistas(usuarioId: string, ids: string[]) {
  try {
    localStorage.setItem(chaveRecusasVistas(usuarioId), JSON.stringify(ids));
  } catch {
    // sem localStorage o fechamento vale so nesta pagina (o estado do Layout)
  }
}

// topbar + menu lateral, envolve toda pagina autenticada
export function Layout() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  // o clique em "Sair" pede confirmacao; a saida automatica (sessao expirada, troca de senha,
  // inativacao) chama logout() direto, sem passar por aqui
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [contadores, setContadores] = useState<ContadoresAprovacao>({});
  // o Layout sai da tela no logout, entao cada login le de novo as recusas vistas do proprio usuario
  const [recusasVistas, setRecusasVistas] = useState<string[]>(() => lerRecusasVistas(usuario?.id));
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
  const recusas = contadores.recusas ?? [];
  const avisoRecusaAberto = ehProfessor && recusados > 0 && recusas.some((id) => !recusasVistas.includes(id));

  // guarda so as recusas em aberto agora: as resolvidas nao voltam (uma recusa nova tem outro id)
  const fecharAvisoRecusa = () => {
    setRecusasVistas(recusas);
    if (usuario) gravarRecusasVistas(usuario.id, recusas);
  };

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
                {item.label}
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
        {avisoRecusaAberto && (
          <div className="aviso-recusados" role="status">
            <p>
              {recusados === 1 ? "1 item seu foi recusado" : `${recusados} itens seus foram recusados`} pela equipe. Veja o
              motivo, corrija e reenvie em{" "}
              {(contadores.eventosRecusados ?? 0) > 0 && <Link to="/eventos">Eventos</Link>}
              {(contadores.eventosRecusados ?? 0) > 0 && (contadores.palestrantesRecusados ?? 0) > 0 && " e "}
              {(contadores.palestrantesRecusados ?? 0) > 0 && <Link to="/palestrantes">Palestrantes</Link>}.
            </p>
            <button type="button" className="aviso-fechar" onClick={fecharAvisoRecusa} aria-label="Fechar aviso" title="Fechar aviso">
              ×
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
