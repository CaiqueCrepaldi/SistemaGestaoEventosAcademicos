import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ToastViewport } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthContext";
import { AuditoriaPage } from "./pages/Auditoria/AuditoriaPage";
import { CadastroPage } from "./pages/Cadastro/CadastroPage";
import { CertificadosPage } from "./pages/Certificados/CertificadosPage";
import { CheckinPage } from "./pages/Checkin/CheckinPage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { EsqueciSenhaPage } from "./pages/EsqueciSenha/EsqueciSenhaPage";
import { EventosPage } from "./pages/Eventos/EventosPage";
import { FeedbackPage } from "./pages/Feedback/FeedbackPage";
import { InscricoesPage } from "./pages/Inscricoes/InscricoesPage";
import { PoliticaDePrivacidadePage } from "./pages/Legal/PoliticaDePrivacidadePage";
import { TermosDeUsoPage } from "./pages/Legal/TermosDeUsoPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { MeusDadosPage } from "./pages/MeusDados/MeusDadosPage";
import { MinhaContaPage } from "./pages/MinhaConta/MinhaContaPage";
import { PalestrantesPage } from "./pages/Palestrantes/PalestrantesPage";
import { PrimeiroAcessoPage } from "./pages/PrimeiroAcesso/PrimeiroAcessoPage";
import { EquipePage } from "./pages/Equipe/EquipePage";
import { ParticipantesPage } from "./pages/Participantes/ParticipantesPage";
import { QuestionarioPage } from "./pages/Questionario/QuestionarioPage";
import { SalasPage } from "./pages/Salas/SalasPage";
import { ValidarCertificadoPage } from "./pages/ValidarCertificado/ValidarCertificadoPage";

// raiz da aplicacao: define todas as rotas e onde cada perfil pode entrar
export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastViewport />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
          {/* publica: o professor ativa a conta criada pela equipe (codigo + senha + aceite dos Termos) */}
          <Route path="/primeiro-acesso" element={<PrimeiroAcessoPage />} />
          <Route path="/termos-de-uso" element={<TermosDeUsoPage />} />
          <Route path="/politica-de-privacidade" element={<PoliticaDePrivacidadePage />} />
          {/* publica: qualquer pessoa confere um certificado pelo codigo impresso no PDF */}
          <Route path="/validar-certificado" element={<ValidarCertificadoPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* rotas que todos os perfis acessam (cada tela mostra o que o perfil pode; a API filtra) */}
              <Route element={<ProtectedRoute perfis={["ADMINISTRADOR", "SECRETARIA", "ALUNO", "PROFESSOR"]} />}>
                <Route path="/eventos" element={<EventosPage />} />
                <Route path="/eventos/:eventoId/questionario" element={<QuestionarioPage />} />
                <Route path="/palestrantes" element={<PalestrantesPage />} />
                {/* a Agenda foi unida a tela Eventos: link antigo leva pra la */}
                <Route path="/agenda" element={<Navigate to="/eventos" replace />} />
                <Route path="/certificados" element={<CertificadosPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="/minha-conta" element={<MinhaContaPage />} />
              </Route>
              {/* rotas exclusivas do ALUNO */}
              <Route element={<ProtectedRoute perfis={["ALUNO"]} />}>
                <Route path="/meus-dados" element={<MeusDadosPage />} />
              </Route>
              {/* gestao: equipe e professor (o professor so com os eventos dele — a API filtra) */}
              <Route element={<ProtectedRoute perfis={["ADMINISTRADOR", "SECRETARIA", "PROFESSOR"]} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/inscricoes" element={<InscricoesPage />} />
                <Route path="/checkin" element={<CheckinPage />} />
              </Route>
              {/* rotas exclusivas de ADMINISTRADOR/SECRETARIA */}
              <Route element={<ProtectedRoute perfis={["ADMINISTRADOR", "SECRETARIA"]} />}>
                <Route path="/salas" element={<SalasPage />} />
                <Route path="/participantes" element={<ParticipantesPage />} />
                <Route path="/equipe" element={<EquipePage />} />
                {/* a tela Professores virou Equipe (professor e secretaria): link antigo leva pra la */}
                <Route path="/professores" element={<Navigate to="/equipe" replace />} />
                <Route path="/auditoria" element={<AuditoriaPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
