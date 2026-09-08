import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Badge';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/atividades', label: 'Atividades', icon: '🏃' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/mural', label: 'Mural', icon: '📣' },
  { to: '/perfil', label: 'Meu Perfil', icon: '👤' },
];

export function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="topbar__menu-toggle"
          aria-label="Abrir menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <span className="topbar__brand">🏔️ Torre</span>
        <div className="topbar__user">
          <span className="topbar__user-name">{user?.name}</span>
          <Link to="/perfil" aria-label="Meu perfil">
            <Avatar name={user?.name ?? '?'} avatarType={user?.avatarType} avatarUrl={user?.avatarUrl} userId={user?.id} size={32} />
          </Link>
          <button type="button" className="btn btn--ghost btn--small" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`} aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div className="sidebar__section-label">Administração</div>
              <NavLink
                to="/admin/aprovacoes"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">✅</span> Aprovações
              </NavLink>
              <NavLink
                to="/admin/modalidades"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🏋️</span> Modalidades
              </NavLink>
              <NavLink
                to="/admin/pontos"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">💰</span> Gerenciar Pontos
              </NavLink>
            </>
          )}
        </nav>
        {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
