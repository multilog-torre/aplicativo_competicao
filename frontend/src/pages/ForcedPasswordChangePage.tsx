import { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../api/client';
import { Logo } from '../components/ui/Logo';
import multilogWordmark from '../assets/multilog-wordmark.png';

/**
 * Bloqueia o acesso ao resto do sistema até a pessoa trocar a senha —
 * renderizada por ProtectedRoute no lugar do Outlet enquanto
 * user.mustChangePassword for true (ver auth-context e usuarios-e-acesso.md).
 * Só acontece depois que um ADMIN reseta a senha de alguém (o admin passa a
 * conhecer a senha atual, então a pessoa é obrigada a trocar antes de usar
 * qualquer outra tela).
 */
export function ForcedPasswordChangePage() {
  const { logout, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch('/profile/password', { currentPassword, newPassword });
      showToast('Senha alterada com sucesso!', 'success');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <img src={multilogWordmark} alt="Multilog" className="auth-page__wordmark" />
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-card__title">
          <Logo iconSize={28} />
        </h1>
        <p className="auth-card__subtitle">Troca de senha obrigatória</p>

        <div className="alert alert--warning">
          Um administrador redefiniu sua senha. Por segurança, você precisa escolher uma senha nova antes de continuar.
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Senha atual (a que te passaram)</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Nova senha (mín. 6 caracteres)</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Confirmar nova senha</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Trocando…' : 'Trocar senha e continuar'}
        </button>

        <button type="button" className="auth-card__link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={logout}>
          Sair
        </button>
      </form>
    </div>
  );
}
