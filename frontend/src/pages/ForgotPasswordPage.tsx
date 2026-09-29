import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { Logo } from '../components/ui/Logo';
import multilogWordmark from '../assets/multilog-wordmark.png';

/**
 * "Esqueci minha senha" — sempre mostra a mesma mensagem genérica de
 * sucesso, exista ou não o e-mail (o backend garante isso, ver
 * AuthService.forgotPassword), pra não confirmar pra ninguém quais e-mails
 * estão cadastrados. O TEXTO da mensagem varia por PASSWORD_RESET_MODE no
 * backend (link por e-mail vs. aviso a um admin) — por isso vem pronto na
 * resposta da API em vez de fixo aqui.
 */
export function ForgotPasswordPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email });
      setSentMessage(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o pedido. Tente novamente.');
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
        <p className="auth-card__subtitle">Esqueci minha senha</p>

        {error && <div className="alert alert--error">{error}</div>}

        {sentMessage ? (
          <div className="alert alert--success">{sentMessage}</div>
        ) : (
          <>
            <p className="steps-list__description" style={{ marginTop: 0 }}>
              Digite o e-mail corporativo da sua conta para pedir a redefinição da sua senha.
            </p>
            <label className="field">
              <span className="field__label">E-mail corporativo</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </label>

            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Pedir redefinição de senha'}
            </button>
          </>
        )}

        <Link to="/login" className="auth-card__link">
          Voltar para o login
        </Link>
      </form>
    </div>
  );
}
