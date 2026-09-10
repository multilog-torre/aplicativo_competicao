import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Level } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

export function AdminLevelsPage() {
  const { showToast } = useToast();
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Level | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<Level[]>('/levels')
      .then(({ data }) => setLevels([...data].sort((a, b) => a.minPoints - b.minPoints)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os níveis.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const { data } = await api.delete<{ message: string }>(`/levels/${deletingId}`);
      showToast(data.message, 'success');
      setDeletingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir o nível.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Níveis</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Novo nível
        </button>
      </div>

      <p>
        Cada nível tem uma pontuação mínima (<strong>minPoints</strong>). Quando o total de pontos de um colaborador
        muda, ele é reclassificado automaticamente para o nível de maior pontuação mínima que ainda alcança —
        ninguém fica "sem nível".
      </p>

      {loading && <LoadingState label="Carregando níveis…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && levels.length === 0 && <EmptyState icon="🏅" title="Nenhum nível cadastrado" />}

      {!loading && !error && levels.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nome</th>
                <th>Pontuação mínima</th>
                <th>Ícone</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id}>
                  <td data-label="Nº">{l.levelNumber}</td>
                  <td data-label="Nome">{l.name}</td>
                  <td data-label="Pontuação mínima">{l.minPoints.toLocaleString('pt-BR')} pts</td>
                  <td data-label="Ícone">{l.badgeIcon}</td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(l)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--small btn--danger" onClick={() => setDeletingId(l.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <LevelFormModal
          level={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            showToast(editing ? 'Nível atualizado com sucesso!' : 'Nível criado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir nível"
          message="Colaboradores que estavam neste nível serão reclassificados automaticamente para o nível correspondente ao seu total de pontos."
          confirmLabel="Excluir"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function LevelFormModal({
  level,
  onClose,
  onSaved,
}: {
  level: Level | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEditing = !!level;
  const [levelNumber, setLevelNumber] = useState(String(level?.levelNumber ?? ''));
  const [name, setName] = useState(level?.name ?? '');
  const [minPoints, setMinPoints] = useState(String(level?.minPoints ?? 0));
  const [badgeIcon, setBadgeIcon] = useState(level?.badgeIcon ?? 'award');
  const [description, setDescription] = useState(level?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      levelNumber: Number(levelNumber),
      name,
      minPoints: Number(minPoints),
      badgeIcon,
      description: description || undefined,
    };

    try {
      if (isEditing) {
        await api.patch(`/levels/${level!.id}`, payload);
      } else {
        await api.post('/levels', payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar o nível.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Editar nível' : 'Novo nível'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <div className="form__row">
          <label className="field">
            <span className="field__label">Número do nível (ordem)</span>
            <input type="number" min="1" required value={levelNumber} onChange={(e) => setLevelNumber(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Pontuação mínima</span>
            <input type="number" min="0" required value={minPoints} onChange={(e) => setMinPoints(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Nome</span>
          <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Ícone (identificador para o frontend, ex.: award, star, crown)</span>
          <input type="text" value={badgeIcon} onChange={(e) => setBadgeIcon(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Descrição (opcional)</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar nível'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
