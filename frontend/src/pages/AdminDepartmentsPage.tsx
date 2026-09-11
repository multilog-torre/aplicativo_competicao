import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Department } from '../types/api';
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';

export function AdminDepartmentsPage() {
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<Department[]>('/departments?status=ALL')
      .then(({ data }) => setDepartments(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os departamentos.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const { data } = await api.delete<{ status: string; message: string }>(`/departments/${deletingId}`);
      showToast(data.message, 'success');
      setDeletingId(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível excluir o departamento.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleReactivate(dept: Department) {
    setBusyId(dept.id);
    try {
      await api.patch(`/departments/${dept.id}`, { status: 'ACTIVE' });
      showToast('Departamento reativado com sucesso!', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível reativar o departamento.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Departamentos</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Novo departamento
        </button>
      </div>

      <p>
        Departamentos organizam os colaboradores por área (ex.: Vendas, TI, Logística) e aparecem no cadastro, no
        perfil e nos filtros de ranking. Um departamento com colaboradores vinculados é apenas desativado ao ser
        excluído — o histórico continua intacto.
      </p>

      {loading && <LoadingState label="Carregando departamentos…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && departments.length === 0 && <EmptyState icon="🏢" title="Nenhum departamento cadastrado" />}

      {!loading && !error && departments.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Colaboradores</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nome">{d.name}</td>
                  <td data-label="Descrição">{d.description ?? '—'}</td>
                  <td data-label="Colaboradores">{d.usersCount ?? 0}</td>
                  <td data-label="Status">
                    <span className={`badge badge--${d.status === 'ACTIVE' ? 'success' : 'neutral'}`}>
                      {d.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(d)}>
                      Editar
                    </button>
                    {d.status === 'ACTIVE' ? (
                      <button type="button" className="btn btn--small btn--danger" onClick={() => setDeletingId(d.id)}>
                        Excluir
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--small btn--secondary"
                        disabled={busyId === d.id}
                        onClick={() => handleReactivate(d)}
                      >
                        {busyId === d.id ? 'Reativando…' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <DepartmentFormModal
          department={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            showToast(editing ? 'Departamento atualizado com sucesso!' : 'Departamento criado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Excluir departamento"
          message="Se houver colaboradores vinculados a ele, o departamento será desativado em vez de excluído, para preservar o histórico. Você pode reativá-lo depois."
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

function DepartmentFormModal({
  department,
  onClose,
  onSaved,
}: {
  department: Department | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEditing = !!department;
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = { name, description: description || undefined };

    try {
      if (isEditing) {
        await api.patch(`/departments/${department!.id}`, payload);
      } else {
        await api.post('/departments', payload);
      }
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar o departamento.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Editar departamento' : 'Novo departamento'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Nome</span>
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Vendas, TI, Logística"
          />
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
            {submitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar departamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
