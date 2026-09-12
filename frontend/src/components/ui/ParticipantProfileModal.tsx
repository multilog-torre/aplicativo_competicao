import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { GENDER_LABELS, ProfileData } from '../../types/api';
import { LoadingState, ErrorState, EmptyState } from './States';
import { Avatar, StatusBadge } from './Badge';
import { AchievementGrid } from './AchievementGrid';
import { Modal } from './Modal';

/**
 * Perfil completo de um colega, aberto a partir da seção "Participantes"
 * (ou de qualquer outro lugar que precise mostrar o perfil de outra pessoa,
 * ex.: ranking, mural). Somente leitura — troca de avatar, senha e dados
 * pessoais continuam exclusivas de "Meu Perfil".
 */
export function ParticipantProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<ProfileData>(`/profile/${userId}`)
      .then(({ data }) => setProfile(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar este perfil.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [userId]);

  return (
    <Modal title={profile?.name ?? 'Perfil do participante'} onClose={onClose} className="modal--wide">
      {loading && <LoadingState label="Carregando perfil…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && profile && (
        <div className="participant-profile">
          <div className="participant-profile__header">
            <Avatar name={profile.name} avatarType={profile.avatarType} avatarUrl={profile.avatarUrl} userId={profile.id} size={72} />
            <div>
              <h3 className="participant-profile__name">{profile.name}</h3>
              {profile.position && <p className="participant-profile__position">{profile.position}</p>}
              {profile.department && <p className="participant-profile__department">{profile.department.name}</p>}
            </div>
          </div>

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

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-card__label">Idade</span>
              <span className="stat-card__value">{profile.age != null ? `${profile.age} anos` : '—'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Data de nascimento</span>
              <span className="stat-card__value">
                {profile.birthDate ? new Date(profile.birthDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Sexo</span>
              <span className="stat-card__value">{profile.gender ? GENDER_LABELS[profile.gender] : '—'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">Participante desde</span>
              <span className="stat-card__value">{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
          </div>

          <section>
            <h4 className="card__title">Conquistas</h4>
            <AchievementGrid userId={profile.id} />
          </section>

          <section>
            <h4 className="card__title">Atividades Recentes</h4>
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
      )}
    </Modal>
  );
}
