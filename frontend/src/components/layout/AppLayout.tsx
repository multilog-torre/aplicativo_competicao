import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Badge';
import { Logo } from '../ui/Logo';
import { ParticipantsIcon } from '../ui/icons';
import { AchievementUnlockWatcher } from '../ui/AchievementUnlockWatcher';
import { NotificationBell } from '../ui/NotificationBell';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/regras', label: 'Como Funciona', icon: '❓' },
  { to: '/painel', label: 'Painel Geral', icon: '📈' },
  { to: '/atividades', label: 'Atividades', icon: '🏃' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/hall-da-fama', label: 'Hall da Fama', icon: '🎖️' },
  { to: '/participantes', label: 'Participantes', icon: <ParticipantsIcon /> },
  { to: '/mural', label: 'Mural', icon: '📣' },
  { to: '/eventos', label: 'Eventos', icon: '🎉' },
  { to: '/perfil', label: 'Meu Perfil', icon: '👤' },
];

export function AppLayout() {
  const { user, logout, isAdmin, isAdminMaster } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <AchievementUnlockWatcher />
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
        <span className="topbar__brand">
          <Logo iconSize={22} />
        </span>
        <div className="topbar__user">
          <span className="topbar__user-name">{user?.name}</span>
          <NotificationBell />
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
          >
            {theme === 'light' ? '☀️' : '🌙'}
          </button>
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
                to="/admin/departamentos"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🏢</span> Departamentos
              </NavLink>
              <NavLink
                to="/admin/niveis"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🏅</span> Níveis
              </NavLink>
              <NavLink
                to="/admin/pontos"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">💰</span> Gerenciar Pontos
              </NavLink>
              <NavLink
                to="/admin/ciclos"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🏁</span> Ciclos de Premiação
              </NavLink>
              <NavLink
                to="/admin/eventos"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🎉</span> Eventos
              </NavLink>
              <NavLink
                to="/admin/conquistas"
                className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden="true">🏆</span> Conquistas
              </NavLink>
              {isAdminMaster && (
                <NavLink
                  to="/admin/usuarios"
                  className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span aria-hidden="true">👥</span> Gerenciar Usuários
                </NavLink>
              )}
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
