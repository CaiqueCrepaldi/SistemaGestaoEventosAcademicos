import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { AgendaPage } from "./pages/Agenda/AgendaPage";
import { CheckinPage } from "./pages/Checkin/CheckinPage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { EventosPage } from "./pages/Eventos/EventosPage";
import { FeedbackPage } from "./pages/Feedback/FeedbackPage";
import { InscricoesPage } from "./pages/Inscricoes/InscricoesPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { PalestrantesPage } from "./pages/Palestrantes/PalestrantesPage";
import { ParticipantesPage } from "./pages/Participantes/ParticipantesPage";
import { SalasPage } from "./pages/Salas/SalasPage";
import { SessoesPage } from "./pages/Sessoes/SessoesPage";
import { TrabalhosPage } from "./pages/Trabalhos/TrabalhosPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/eventos" element={<EventosPage />} />
              <Route path="/sessoes" element={<SessoesPage />} />
              <Route path="/salas" element={<SalasPage />} />
              <Route path="/palestrantes" element={<PalestrantesPage />} />
              <Route path="/participantes" element={<ParticipantesPage />} />
              <Route path="/inscricoes" element={<InscricoesPage />} />
              <Route path="/checkin" element={<CheckinPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/trabalhos" element={<TrabalhosPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
