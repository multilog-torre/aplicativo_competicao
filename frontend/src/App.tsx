import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute, AdminRoute } from './routes/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { RankingPage } from './pages/RankingPage';
import { MuralPage } from './pages/MuralPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminApprovalsPage } from './pages/AdminApprovalsPage';
import { AdminModalitiesPage } from './pages/AdminModalitiesPage';
import { AdminPointsPage } from './pages/AdminPointsPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/atividades" element={<ActivitiesPage />} />
                <Route path="/ranking" element={<RankingPage />} />
                <Route path="/mural" element={<MuralPage />} />
                <Route path="/perfil" element={<ProfilePage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin/aprovacoes" element={<AdminApprovalsPage />} />
                  <Route path="/admin/modalidades" element={<AdminModalitiesPage />} />
                  <Route path="/admin/pontos" element={<AdminPointsPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
