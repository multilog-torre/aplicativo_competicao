import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../api/client';
import { Logo } from '../components/ui/Logo';
import multilogWordmark from '../assets/multilog-wordmark.png';

/** Tela acessada pelo link do e-mail de "esqueci minha senha" (token na URL). */
export function ResetPasswordPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      showToast('Senha redefinida com sucesso! Já pode entrar com a senha nova.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível redefinir a senha. Tente novamente.');
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
        <p className="auth-card__subtitle">Escolha uma senha nova</p>

        {error && <div className="alert alert--error">{error}</div>}
        {!token && <div className="alert alert--error">Link inválido — falta o token de redefinição. Peça um novo link em "Esqueci minha senha".</div>}

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

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting || !token}>
          {submitting ? 'Redefinindo…' : 'Redefinir senha'}
        </button>

        <Link to="/login" className="auth-card__link">
          Voltar para o login
        </Link>
      </form>
    </div>
  );
}
