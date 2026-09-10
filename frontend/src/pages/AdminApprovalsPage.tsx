import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, API_URL, getToken } from '../api/client';
import { ActivityDetail, EvidenceItem } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useAuthedImage } from '../api/useAuthedImage';
import { useToast } from '../context/ToastContext';

interface PendingActivity {
  id: string;
  quantity: number;
  unit: string | null;
  calculatedPoints: number;
  activityDate: string;
  user: { name: string; corporateId: string | null };
  activityType: { name: string; requiresEvidence: boolean };
  _count: { evidences: number };
}

export function AdminApprovalsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<PendingActivity[]>('/admin/activities/pending?limit=50')
      .then(({ data }) => setItems(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as pendências.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleApprove(id: string) {
    setApprovingId(null);
    try {
      await api.post(`/admin/activities/${id}/approve`);
      showToast('Atividade aprovada com sucesso!', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível aprovar.', 'error');
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Atividades Pendentes</h1>

      {loading && <LoadingState label="Carregando pendências…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <EmptyState icon="✅" title="Nenhuma atividade pendente" description="Tudo em dia por aqui!" />}

      {!loading && !error && items.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Modalidade</th>
                <th>Quantidade</th>
                <th>Pontos</th>
                <th>Evidência</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Usuário">{item.user.name}</td>
                  <td data-label="Modalidade">{item.activityType.name}</td>
                  <td data-label="Quantidade">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                  </td>
                  <td data-label="Pontos">+{item.calculatedPoints}</td>
                  <td data-label="Evidência">{item._count.evidences > 0 ? `${item._count.evidences} arquivo(s)` : '—'}</td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setDetailsId(item.id)}>
                      Ver detalhes
                    </button>
                    <button type="button" className="btn btn--small btn--primary" onClick={() => setApprovingId(item.id)}>
                      Aprovar
                    </button>
                    <button type="button" className="btn btn--small btn--danger" onClick={() => setRejectingId(item.id)}>
                      Rejeitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailsId && (
        <ActivityDetailModal
          activityId={detailsId}
          onClose={() => setDetailsId(null)}
          onApprove={() => {
            setDetailsId(null);
            setApprovingId(detailsId);
          }}
          onReject={() => {
            setDetailsId(null);
            setRejectingId(detailsId);
          }}
        />
      )}

      {approvingId && (
        <ConfirmModal
          title="Aprovar atividade"
          message="Confirma a aprovação desta atividade? Os pontos serão creditados imediatamente."
          confirmLabel="Aprovar"
          onConfirm={() => handleApprove(approvingId)}
          onCancel={() => setApprovingId(null)}
        />
      )}

      {rejectingId && (
        <RejectModal
          activityId={rejectingId}
          onClose={() => setRejectingId(null)}
          onRejected={() => {
            setRejectingId(null);
            showToast('Atividade rejeitada.', 'info');
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal de revisão — reúne tudo que o admin precisa ver ANTES de decidir:
 * quem registrou, a modalidade e suas regras, o que a pessoa descreveu, e as
 * evidências enviadas (foto pré-visualizada inline; PDF/outros com um botão
 * de abrir — nunca por link público direto, sempre autenticado).
 */
function ActivityDetailModal({
  activityId,
  onClose,
  onApprove,
  onReject,
}: {
  activityId: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<ActivityDetail>(`/activities/${activityId}`)
      .then(({ data }) => setDetail(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os detalhes.'))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [activityId]);

  return (
    <Modal title="Detalhes da atividade" onClose={onClose}>
      {loading && <LoadingState label="Carregando detalhes…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && detail && (
        <div className="form">
          <div className="form__row">
            <div className="field">
              <span className="field__label">Colaborador</span>
              <p>
                {detail.user.name}
                <br />
                <small>{detail.user.email}</small>
              </p>
            </div>
            <div className="field">
              <span className="field__label">Data da atividade</span>
              <p>{new Date(detail.activityDate).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          <div className="form__row">
            <div className="field">
              <span className="field__label">Modalidade</span>
              <p>{detail.activityType.name}</p>
            </div>
            <div className="field">
              <span className="field__label">Quantidade informada</span>
              <p>
                {detail.quantity}
                {detail.unit ? ` ${detail.unit}` : ''} → <strong>+{detail.calculatedPoints} pts</strong> (previsto)
              </p>
            </div>
          </div>

          {detail.activityType.rulesDescription && (
            <div className="field">
              <span className="field__label">Regra da modalidade</span>
              <p>{detail.activityType.rulesDescription}</p>
            </div>
          )}

          <div className="field">
            <span className="field__label">Descrição informada pelo colaborador</span>
            <p>{detail.description?.trim() ? detail.description : <em>Nenhuma descrição informada.</em>}</p>
          </div>

          <div className="field">
            <span className="field__label">Evidências enviadas ({detail.evidences.length})</span>
            {detail.evidences.length === 0 ? (
              <p>
                <em>{detail.activityType.requiresEvidence ? 'Nenhuma evidência enviada — atenção, esta modalidade exige comprovação.' : 'Nenhuma evidência enviada (modalidade não exige).'}</em>
              </p>
            ) : (
              <div className="evidence-grid">
                {detail.evidences.map((ev) => (
                  <EvidencePreview key={ev.id} evidence={ev} />
                ))}
              </div>
            )}
          </div>

          <div className="form__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Fechar
            </button>
            <button type="button" className="btn btn--danger" onClick={onReject}>
              Rejeitar
            </button>
            <button type="button" className="btn btn--primary" onClick={onApprove}>
              Aprovar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Pré-visualiza imagens inline; para outros tipos (PDF, TXT), oferece abrir em nova aba — sempre autenticado. */
function EvidencePreview({ evidence }: { evidence: EvidenceItem }) {
  const isImage = evidence.fileType.startsWith('image/');
  // evidence.downloadUrl já vem com o prefixo "/api/v1" embutido (evidence.service.ts),
  // enquanto API_URL/useAuthedImage já incluem esse mesmo prefixo — removê-lo aqui
  // evita duplicar "/api/v1/api/v1/..." na requisição.
  const relativePath = evidence.downloadUrl.replace(/^\/api\/v1/, '');
  const { url, loading } = useAuthedImage(isImage ? relativePath : undefined);
  const [opening, setOpening] = useState(false);

  async function openInNewTab() {
    setOpening(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}${relativePath}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Falha ao carregar arquivo');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
    } catch {
      // silencioso — o usuário pode tentar de novo
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="evidence-card">
      {isImage ? (
        loading ? (
          <div className="evidence-card__thumb evidence-card__thumb--loading">Carregando…</div>
        ) : url ? (
          <button type="button" className="evidence-card__thumb-btn" onClick={openInNewTab} title="Abrir em tamanho real">
            <img src={url} alt={evidence.fileName} className="evidence-card__thumb" />
          </button>
        ) : (
          <div className="evidence-card__thumb evidence-card__thumb--loading">Falha ao carregar</div>
        )
      ) : (
        <button type="button" className="btn btn--small btn--secondary" onClick={openInNewTab} disabled={opening}>
          {opening ? 'Abrindo…' : `📄 Abrir ${evidence.fileName}`}
        </button>
      )}
      <span className="evidence-card__meta">
        {evidence.fileName} · {(evidence.fileSize / 1024).toFixed(0)} KB
      </span>
    </div>
  );
}

function RejectModal({ activityId, onClose, onRejected }: { activityId: string; onClose: () => void; onRejected: () => void }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/activities/${activityId}/reject`, { reason: reason.trim() });
      onRejected();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível rejeitar.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Rejeitar atividade" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        <label className="field">
          <span className="field__label">Motivo da rejeição (mín. 5 caracteres)</span>
          <textarea rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--danger" disabled={submitting || reason.trim().length < 5}>
            {submitting ? 'Enviando…' : 'Rejeitar atividade'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
