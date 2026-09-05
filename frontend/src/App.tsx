import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ToastViewport } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthContext";
import { AgendaPage } from "./pages/Agenda/AgendaPage";
import { CadastroPage } from "./pages/Cadastro/CadastroPage";
import { CertificadosPage } from "./pages/Certificados/CertificadosPage";
import { CheckinPage } from "./pages/Checkin/CheckinPage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { EsqueciSenhaPage } from "./pages/EsqueciSenha/EsqueciSenhaPage";
import { EventosPage } from "./pages/Eventos/EventosPage";
import { FeedbackPage } from "./pages/Feedback/FeedbackPage";
import { InscricoesPage } from "./pages/Inscricoes/InscricoesPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { PalestrantesPage } from "./pages/Palestrantes/PalestrantesPage";
import { ParticipantesPage } from "./pages/Participantes/ParticipantesPage";
import { QuestionarioPage } from "./pages/Questionario/QuestionarioPage";
import { SalasPage } from "./pages/Salas/SalasPage";

export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastViewport />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<CadastroPage />} />
          <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* rotas que ADMINISTRADOR, SECRETARIA e ALUNO acessam */}
              <Route element={<ProtectedRoute perfis={["ADMINISTRADOR", "SECRETARIA", "ALUNO"]} />}>
                <Route path="/eventos" element={<EventosPage />} />
                <Route path="/eventos/:eventoId/questionario" element={<QuestionarioPage />} />
                <Route path="/palestrantes" element={<PalestrantesPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/certificados" element={<CertificadosPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
              </Route>
              {/* rotas exclusivas de ADMINISTRADOR/SECRETARIA */}
              <Route element={<ProtectedRoute perfis={["ADMINISTRADOR", "SECRETARIA"]} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/salas" element={<SalasPage />} />
                <Route path="/participantes" element={<ParticipantesPage />} />
                <Route path="/inscricoes" element={<InscricoesPage />} />
                <Route path="/checkin" element={<CheckinPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
