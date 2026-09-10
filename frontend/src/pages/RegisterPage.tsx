import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Department, Gender, GENDER_LABELS } from '../types/api';
import { useAuth } from '../context/AuthContext';

const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];

/**
 * Autocadastro — decisão de negócio a pedido do usuário. Diferente da
 * criação de conta pelo ADMIN_MASTER (Admin > Usuários), aqui:
 * - Não existe campo de senha: toda conta nasce com a senha padrão da
 *   empresa (informada pelo backend na resposta), trocável depois em
 *   Meu Perfil.
 * - A conta nasce PENDENTE — só pode logar depois que um administrador
 *   aprovar (Admin > Usuários).
 */
export function RegisterPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [corporateId, setCorporateId] = useState('');
  const [position, setPosition] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ defaultPassword: string; message: string } | null>(null);

  useEffect(() => {
    api.get<Department[]>('/departments').then(({ data }) => setDepartments(data)).catch(() => undefined);
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<{ defaultPassword: string; message: string }>('/auth/register', {
        name,
        email,
        corporateId: corporateId || undefined,
        position: position || undefined,
        departmentId: departmentId || undefined,
        birthDate: birthDate || undefined,
        gender: gender || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-card__title">🏔️ Torre</h1>
          <div className="alert alert--success">{result.message}</div>
          <p>
            Sua senha inicial é: <strong>{result.defaultPassword}</strong>
          </p>
          <p>Você poderá trocá-la depois de logar, na tela de Meu Perfil.</p>
          <Link to="/login" className="btn btn--primary btn--block">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-card__title">🏔️ Torre</h1>
        <p className="auth-card__subtitle">Criar conta com seu e-mail corporativo</p>

        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Nome completo</span>
          <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">E-mail corporativo</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@suaempresa.com.br"
          />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Matrícula (opcional)</span>
            <input type="text" value={corporateId} onChange={(e) => setCorporateId(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Cargo (opcional)</span>
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Departamento (opcional)</span>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">— Sem departamento —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Data de nascimento (opcional)</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="field">
            <span className="field__label">Sexo (opcional)</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">— Não informar —</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="field__hint">
          Sua conta nasce com uma senha padrão e precisa ser aprovada por um administrador antes do primeiro acesso.
        </p>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </button>

        <Link to="/login" className="auth-card__link">
          Já tenho conta — entrar
        </Link>
      </form>
    </div>
  );
}
