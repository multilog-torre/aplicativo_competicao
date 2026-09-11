import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AvatarPreset, Department, Gender, GENDER_LABELS, ProfileData } from '../types/api';

const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States';
import { Avatar, StatusBadge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { todayLocalISODate } from '../utils/date';

export function ProfilePage() {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<ProfileData>('/profile')
      .then(({ data }) => setProfile(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seu perfil.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAvatarChanged() {
    await refreshUser();
    load();
    showToast('Avatar atualizado com sucesso!', 'success');
  }

  async function handleInfoSaved() {
    await refreshUser();
    load();
    showToast('Dados do perfil atualizados com sucesso!', 'success');
  }

  if (loading) return <LoadingState label="Carregando seu perfil…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return null;

  return (
    <div className="page">
      <h1 className="page__title">Meu Perfil</h1>

      <div className="grid-2">
        <section className="card">
          <h2 className="card__title">Avatar</h2>
          <AvatarPicker profile={profile} onChanged={handleAvatarChanged} />
        </section>

        <section className="card">
          <h2 className="card__title">Dados Pessoais</h2>
          <ProfileInfoForm profile={profile} onSaved={handleInfoSaved} />
        </section>
      </div>

      <section className="card">
        <h2 className="card__title">Segurança</h2>
        <ChangePasswordForm />
      </section>

      <section className="card">
        <h2 className="card__title">Resumo</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card__label">Pontos totais</span>
            <span className="stat-card__value">{profile.totalPoints.toLocaleString('pt-BR')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Posição no ranking</span>
            <span className="stat-card__value">{profile.ranking.position ? `${profile.ranking.position}º` : '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Nível</span>
            <span className="stat-card__value">{profile.level?.name ?? '—'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Conquistas</span>
            <span className="stat-card__value">{profile.achievementsCount}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Minhas Conquistas</h2>
        {!profile.achievements || profile.achievements.length === 0 ? (
          <EmptyState icon="🏆" title="Nenhuma conquista desbloqueada ainda" />
        ) : (
          <ul className="achievement-list">
            {profile.achievements.map((a) => (
              <li key={a.id} className="achievement-list__item">
                <span className="achievement-list__icon" aria-hidden="true">
                  🏆
                </span>
                <div>
                  <div className="achievement-list__name">{a.achievement.name}</div>
                  <div className="achievement-list__description">{a.achievement.description}</div>
                </div>
                <span className="achievement-list__date">{new Date(a.unlockedAt).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">Atividades Recentes</h2>
        {!profile.recentActivities || profile.recentActivities.length === 0 ? (
          <EmptyState icon="🏃" title="Nenhuma atividade registrada ainda" />
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Atividade</th>
                  <th>Pontos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {profile.recentActivities.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Data">{new Date(a.activityDate).toLocaleDateString('pt-BR')}</td>
                    <td data-label="Atividade">{a.activityTypeName}</td>
                    <td data-label="Pontos">+{a.calculatedPoints}</td>
                    <td data-label="Status">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AvatarPicker({ profile, onChanged }: { profile: ProfileData; onChanged: () => void }) {
  const { showToast } = useToast();
  const [presets, setPresets] = useState<AvatarPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<AvatarPreset[]>('/profile/avatar-presets')
      .then(({ data }) => setPresets(data))
      .catch(() => showToast('Não foi possível carregar os avatares pré-definidos.', 'error'))
      .finally(() => setLoadingPresets(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectPreset(presetId: string) {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('avatarType', 'PRESET');
      formData.append('presetId', presetId);
      await api.patch('/profile/avatar', formData, true);
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível trocar o avatar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetToInitials() {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('avatarType', 'INITIALS');
      await api.patch('/profile/avatar', formData, true);
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível trocar o avatar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('avatarType', 'UPLOAD');
      formData.append('file', file);
      await api.patch('/profile/avatar', formData, true);
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível enviar a foto.', 'error');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-picker__current">
        <Avatar name={profile.name} avatarType={profile.avatarType} avatarUrl={profile.avatarUrl} userId={profile.id} size={72} />
        <div>
          <p className="avatar-picker__hint">Avatar atual</p>
          <label className="btn btn--small btn--secondary avatar-picker__upload-btn">
            Enviar foto
            <input type="file" accept="image/jpeg,image/png" hidden onChange={handleFileChange} disabled={saving} />
          </label>
          <button type="button" className="btn btn--small btn--ghost" onClick={resetToInitials} disabled={saving}>
            Usar iniciais
          </button>
        </div>
      </div>

      <p className="field__label">Ou escolha um avatar pré-definido:</p>
      {loadingPresets ? (
        <LoadingState label="Carregando avatares…" />
      ) : (
        <div className="avatar-picker__grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="avatar-picker__option"
              title={preset.label}
              disabled={saving}
              onClick={() => selectPreset(preset.id)}
            >
              <Avatar name={preset.label} avatarType="PRESET" avatarUrl={preset.icon} size={44} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangePasswordForm() {
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
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Senha alterada com sucesso!', 'success');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      {error && <div className="alert alert--error">{error}</div>}

      <label className="field">
        <span className="field__label">Senha atual</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>

      <div className="form__row">
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
      </div>

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Alterando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  );
}

function ProfileInfoForm({ profile, onSaved }: { profile: ProfileData; onSaved: () => void }) {
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState(profile.name);
  const [position, setPosition] = useState(profile.position ?? '');
  const [departmentId, setDepartmentId] = useState(profile.department?.id ?? '');
  const [birthDate, setBirthDate] = useState(profile.birthDate ? profile.birthDate.slice(0, 10) : '');
  const [gender, setGender] = useState(profile.gender ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Department[]>('/departments')
      .then(({ data }) => setDepartments(data))
      .catch(() => showToast('Não foi possível carregar a lista de departamentos.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.patch('/profile', {
        name,
        position: position || null,
        departmentId: departmentId || null,
        birthDate: birthDate || null,
        gender: gender || null,
      });
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar seus dados.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      {error && <div className="alert alert--error">{error}</div>}

      <label className="field">
        <span className="field__label">Nome</span>
        <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">Cargo</span>
        <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Ex.: Engenheiro de Software" />
      </label>

      <label className="field">
        <span className="field__label">Departamento</span>
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
          <span className="field__label">Data de nascimento</span>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={todayLocalISODate()} />
        </label>
        <label className="field">
          <span className="field__label">Sexo</span>
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

      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
