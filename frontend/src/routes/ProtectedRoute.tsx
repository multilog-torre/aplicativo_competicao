import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/ui/States';
import { ForcedPasswordChangePage } from '../pages/ForcedPasswordChangePage';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="full-page-center">
        <LoadingState label="Verificando sessão…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Um admin resetou a senha dessa pessoa — bloqueia TODO o resto do
  // sistema (inclusive as áreas admin, se for o caso) até ela trocar.
  if (user.mustChangePassword) return <ForcedPasswordChangePage />;

  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="full-page-center">
        <LoadingState label="Verificando sessão…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}

export function MasterRoute() {
  const { user, loading, isAdminMaster } = useAuth();

  if (loading) {
    return (
      <div className="full-page-center">
        <LoadingState label="Verificando sessão…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminMaster) return <Navigate to="/" replace />;

  return <Outlet />;
}
