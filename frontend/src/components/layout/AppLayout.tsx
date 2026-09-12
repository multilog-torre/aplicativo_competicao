import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Badge';
import { Logo } from '../ui/Logo';
import { AchievementUnlockWatcher } from '../ui/AchievementUnlockWatcher';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/regras', label: 'Como Funciona', icon: '❓' },
  { to: '/painel', label: 'Painel Geral', icon: '📈' },
  { to: '/atividades', label: 'Atividades', icon: '🏃' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/participantes', label: 'Participantes', icon: <ParticipantsIcon /> },
  { to: '/mural', label: 'Mural', icon: '📣' },
  { to: '/eventos', label: 'Eventos', icon: '🎉' },
  { to: '/perfil', label: 'Meu Perfil', icon: '👤' },
];

/**
 * Ícone do item "Participantes" — glifo de grupo de pessoas escolhido pelo
 * usuário (mesmo desenho enviado por ele), em SVG (não emoji) justamente pra
 * poder pintar de laranja escuro via `currentColor`/CSS, o que um emoji não
 * permite (emoji sempre renderiza com as próprias cores fixas).
 */
function ParticipantsIcon() {
  return (
    <svg className="sidebar__icon-svg" viewBox="0 0 640 512" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64s-64 28.7-64 64s28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64s-64 28.7-64 64s28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6c40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32S208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.8-87.3 75.2-109.4z" />
    </svg>
  );
}

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
