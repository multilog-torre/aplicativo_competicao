import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute, AdminRoute, MasterRoute } from './routes/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { RankingPage } from './pages/RankingPage';
import { ParticipantsPage } from './pages/ParticipantsPage';
import { MuralPage } from './pages/MuralPage';
import { ProfilePage } from './pages/ProfilePage';
import { OverviewPage } from './pages/OverviewPage';
import { HallOfFamePage } from './pages/HallOfFamePage';
import { EventsPage } from './pages/EventsPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { RulesPage } from './pages/RulesPage';
import { AdminApprovalsPage } from './pages/AdminApprovalsPage';
import { AdminModalitiesPage } from './pages/AdminModalitiesPage';
import { AdminAchievementsPage } from './pages/AdminAchievementsPage';
import { AdminLevelsPage } from './pages/AdminLevelsPage';
import { AdminPointsPage } from './pages/AdminPointsPage';
import { AdminCyclesPage } from './pages/AdminCyclesPage';
import { AdminDepartmentsPage } from './pages/AdminDepartmentsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/cadastro" element={<RegisterPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/regras" element={<RulesPage />} />
                  <Route path="/painel" element={<OverviewPage />} />
                  <Route path="/atividades" element={<ActivitiesPage />} />
                  <Route path="/ranking" element={<RankingPage />} />
                  <Route path="/hall-da-fama" element={<HallOfFamePage />} />
                  <Route path="/participantes" element={<ParticipantsPage />} />
                  <Route path="/mural" element={<MuralPage />} />
                  <Route path="/eventos" element={<EventsPage />} />
                  <Route path="/perfil" element={<ProfilePage />} />

                  <Route element={<AdminRoute />}>
                    <Route path="/admin/aprovacoes" element={<AdminApprovalsPage />} />
                    <Route path="/admin/modalidades" element={<AdminModalitiesPage />} />
                    <Route path="/admin/niveis" element={<AdminLevelsPage />} />
                    <Route path="/admin/pontos" element={<AdminPointsPage />} />
                    <Route path="/admin/ciclos" element={<AdminCyclesPage />} />
                    <Route path="/admin/departamentos" element={<AdminDepartmentsPage />} />
                    <Route path="/admin/eventos" element={<AdminEventsPage />} />
                    <Route path="/admin/conquistas" element={<AdminAchievementsPage />} />
                  </Route>

                  <Route element={<MasterRoute />}>
                    <Route path="/admin/usuarios" element={<AdminUsersPage />} />
                    <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
