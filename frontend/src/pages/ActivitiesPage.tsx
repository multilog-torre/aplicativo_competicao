import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ActivityType, UserActivity } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { useAuthedImage } from '../api/useAuthedImage';
import { todayLocalISODate } from '../utils/date';

export function ActivitiesPage() {
  const { showToast } = useToast();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<UserActivity[]>('/activities?limit=50')
      .then(({ data }) => setActivities(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar suas atividades.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Minhas Atividades</h1>
        <button type="button" className="btn btn--primary" onClick={() => setModalOpen(true)}>
          + Nova atividade
        </button>
      </div>

      <ActivityCalendarSection />

      {loading && <LoadingState label="Carregando suas atividades…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && activities.length === 0 && (
        <EmptyState icon="🏃" title="Nenhuma atividade registrada" description="Clique em “Nova atividade” para começar a pontuar." />
      )}

      {!loading && !error && activities.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Modalidade</th>
                <th>Quantidade</th>
                <th>Pontos</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td data-label="Data">{new Date(a.activityDate).toLocaleDateString('pt-BR')}</td>
                  <td data-label="Modalidade">{a.activityType?.name}</td>
                  <td data-label="Quantidade">
                    {a.quantity}
                    {a.unit ? ` ${a.unit}` : ''}
                  </td>
                  <td data-label="Pontos">+{a.calculatedPoints}</td>
                  <td data-label="Status">
                    <StatusBadge status={a.status} />
                    {a.status === 'REJECTED' && a.rejectionReason && (
                      <span className="table__hint" title={a.rejectionReason}>
                        ⓘ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NewActivityModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            showToast('Atividade registrada com sucesso! Aguarde a aprovação.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function NewActivityModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [activityTypeId, setActivityTypeId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [activityDate, setActivityDate] = useState(todayLocalISODate);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ActivityType[]>('/activity-types?status=ACTIVE')
      .then(({ data }) => {
        setTypes(data);
        if (data[0]) setActivityTypeId(data[0].id);
      })
      .catch(() => setFormError('Não foi possível carregar as modalidades.'))
      .finally(() => setLoadingTypes(false));
  }, []);

  const selectedType = types.find((t) => t.id === activityTypeId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (selectedType?.requiresEvidence && !file) {
      setFormError('Esta modalidade exige o envio de uma evidência (foto/comprovante).');
      return;
    }

    setSubmitting(true);
    try {
      const { data: activity } = await api.post<{ id: string }>('/activities', {
        activityTypeId,
        // "T00:00:00" (sem "Z") força o navegador a interpretar isso como
        // meia-noite NO FUSO LOCAL — se só passássemos activityDate puro
        // ("YYYY-MM-DD"), o JS trata como meia-noite UTC, e ao exibir de
        // volta no fuso do Brasil (UTC-3) isso "volta" pro dia anterior.
        activityDate: new Date(`${activityDate}T00:00:00`).toISOString(),
        quantity: Number(quantity),
        description: description || undefined,
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/activities/${activity.id}/evidence`, formData, true);
      }

      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível registrar a atividade.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nova atividade" onClose={onClose}>
      {loadingTypes ? (
        <LoadingState label="Carregando modalidades…" />
      ) : (
        <form onSubmit={handleSubmit} className="form">
          {formError && <div className="alert alert--error">{formError}</div>}

          <label className="field">
            <span className="field__label">Modalidade</span>
            <select value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className="form__row">
            <label className="field">
              <span className="field__label">Quantidade{selectedType?.unit ? ` (${selectedType.unit})` : ''}</span>
              <input type="number" min="0.01" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Data</span>
              <input type="date" required value={activityDate} max={todayLocalISODate()} onChange={(e) => setActivityDate(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Descrição (opcional)</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </label>

          <label className="field">
            <span className="field__label">
              Evidência {selectedType?.requiresEvidence ? '(obrigatória para esta modalidade)' : '(opcional)'}
            </span>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="form__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Registrar atividade'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const WEEKDAY_LABELS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MONTH_LABELS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Calendário mensal com a fotinho da evidência enviada em cada dia
 * registrado (a pedido do usuário — inspirado num calendário de treinos
 * estilo Strava). Dia sem evidência mostra só o número; dia com evidência
 * mostra a foto no lugar do número, clicável para ver o registro completo.
 */
function ActivityCalendarSection() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [byDay, setByDay] = useState<Map<number, UserActivity[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<UserActivity[] | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  function load() {
    setLoading(true);
    setError(null);
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    api
      .get<UserActivity[]>(`/activities?dateFrom=${from.toISOString()}&dateTo=${to.toISOString()}&limit=100`)
      .then(({ data }) => {
        // Agrupa TODAS as atividades com evidência de cada dia — antes só a
        // primeira era guardada e as demais do mesmo dia eram descartadas.
        const map = new Map<number, UserActivity[]>();
        [...data]
          .sort((a, b) => new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime())
          .forEach((act) => {
            if (!act.evidences || act.evidences.length === 0) return;
            const day = new Date(act.activityDate).getDate();
            const existing = map.get(day);
            if (existing) existing.push(act);
            else map.set(day, [act]);
          });
        setByDay(map);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o calendário.'))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function goToMonth(offset: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  return (
    <section className="card">
      <div className="activity-calendar__header">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => goToMonth(-1)} aria-label="Mês anterior">
          ‹
        </button>
        <h2 className="card__title" style={{ margin: 0 }}>
          📅 {MONTH_LABELS[month]} {year}
        </h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => goToMonth(1)} aria-label="Próximo mês">
          ›
        </button>
      </div>

      {loading && <LoadingState label="Carregando calendário…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          <div className="activity-calendar__weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="activity-calendar__grid">
            {cells.map((day, i) =>
              day === null ? (
                <div key={`empty-${i}`} />
              ) : (
                <ActivityCalendarDay key={day} day={day} activities={byDay.get(day)} onSelect={setSelectedDay} />
              ),
            )}
          </div>
          {byDay.size === 0 && (
            <p className="steps-list__description" style={{ marginTop: 12, marginBottom: 0 }}>
              Nenhuma foto de registro neste mês ainda. Envie uma evidência ao registrar uma atividade para ela aparecer aqui.
            </p>
          )}
        </>
      )}

      {selectedDay && <ActivityDayModal activities={selectedDay} onClose={() => setSelectedDay(null)} />}
    </section>
  );
}

function ActivityCalendarDay({
  day,
  activities,
  onSelect,
}: {
  day: number;
  activities: UserActivity[] | undefined;
  onSelect: (activities: UserActivity[]) => void;
}) {
  const firstEvidence = activities?.[0]?.evidences?.[0];
  const isImage = !!firstEvidence && firstEvidence.fileType.startsWith('image/');
  // evidence.downloadUrl já vem com o prefixo "/api/v1" embutido (activity.service.ts),
  // enquanto API_URL/useAuthedImage já incluem esse mesmo prefixo — removê-lo aqui
  // evita duplicar "/api/v1/api/v1/..." na requisição (mesmo padrão de AdminApprovalsPage).
  const relativePath = firstEvidence?.downloadUrl.replace(/^\/api\/v1/, '');
  const { url } = useAuthedImage(isImage ? relativePath : null);

  if (!activities || activities.length === 0 || !firstEvidence) {
    return (
      <div className="activity-calendar__cell">
        <span className="activity-calendar__day-number">{day}</span>
      </div>
    );
  }

  const extraCount = activities.length - 1;

  return (
    <button
      type="button"
      className="activity-calendar__cell activity-calendar__cell--photo"
      onClick={() => onSelect(activities)}
      title={activities.map((a) => a.activityType?.name).filter(Boolean).join(', ')}
    >
      {isImage && url ? (
        <img src={url} alt="" className="activity-calendar__photo" />
      ) : (
        <span className="activity-calendar__photo activity-calendar__photo--placeholder" aria-hidden="true">
          {isImage ? '' : '📄'}
        </span>
      )}
      {extraCount > 0 && <span className="activity-calendar__count-badge">+{extraCount}</span>}
    </button>
  );
}

/** Mostra TODAS as atividades com evidência do dia clicado — não só a primeira. */
function ActivityDayModal({ activities, onClose }: { activities: UserActivity[]; onClose: () => void }) {
  const dateLabel = new Date(activities[0].activityDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Modal title={`Registros de ${dateLabel}`} onClose={onClose}>
      <div className="form">
        {activities.map((activity, index) => (
          <div key={activity.id}>
            {index > 0 && <hr className="activity-day-modal__divider" />}
            <ActivityDayEntry activity={activity} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ActivityDayEntry({ activity }: { activity: UserActivity }) {
  const evidence = activity.evidences?.[0];
  const isImage = !!evidence && evidence.fileType.startsWith('image/');
  const relativePath = evidence?.downloadUrl.replace(/^\/api\/v1/, '');
  const { url } = useAuthedImage(relativePath);

  return (
    <div>
      <p className="steps-list__title" style={{ margin: '0 0 6px' }}>
        {activity.activityType?.name ?? 'Registro'}
      </p>

      {isImage && url && (
        <img src={url} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', marginBottom: 12, display: 'block' }} />
      )}
      {evidence && !isImage && url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="btn btn--secondary btn--small"
          style={{ marginBottom: 12, display: 'inline-block' }}
        >
          📄 Abrir arquivo enviado
        </a>
      )}

      <p style={{ marginBottom: 6 }}>
        <strong>
          {activity.quantity}
          {activity.unit ? ` ${activity.unit}` : ''}
        </strong>{' '}
        · +{activity.calculatedPoints} pts · <StatusBadge status={activity.status} />
      </p>
      {activity.description && <p style={{ marginTop: 0 }}>{activity.description}</p>}
    </div>
  );
}
