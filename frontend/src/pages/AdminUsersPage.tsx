import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AdminUser, Department, Gender, GENDER_LABELS, RoleCatalogItem } from '../types/api';

const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];
import { LoadingState, EmptyState, ErrorState } from '../components/ui/States';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  PARTICIPANTE: 'Participante',
  ADMIN: 'Administrador',
  ADMIN_MASTER: 'Administrador Master',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  PENDING_APPROVAL: 'Pendente de aprovação',
};

const STATUS_BADGE_TONE: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  PENDING_APPROVAL: 'warning',
};

export function AdminUsersPage() {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<RoleCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [managingRoles, setManagingRoles] = useState<AdminUser | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const query = search ? `&search=${encodeURIComponent(search)}` : '';
    api
      .get<AdminUser[]>(`/admin/users?limit=100${query}`)
      .then(({ data }) => setUsers(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários.'))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [search]);

  useEffect(() => {
    api.get<Department[]>('/departments').then(({ data }) => setDepartments(data)).catch(() => undefined);
    api.get<RoleCatalogItem[]>('/roles').then(({ data }) => setRoles(data)).catch(() => undefined);
  }, []);

  async function onApprove(userId: string) {
    try {
      await api.patch(`/admin/users/${userId}`, { status: 'ACTIVE' });
      showToast('Cadastro aprovado — o usuário já pode fazer login.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Não foi possível aprovar o cadastro.', 'error');
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Gerenciar Usuários</h1>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          + Novo usuário
        </button>
      </div>

      <div className="card">
        <label className="field">
          <span className="field__label">Buscar por nome ou e-mail</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Renan, gestor@empresa.com" />
        </label>
      </div>

      {loading && <LoadingState label="Carregando usuários…" />}
      {error && !loading && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && users.length === 0 && <EmptyState icon="👥" title="Nenhum usuário encontrado" />}

      {!loading && !error && users.length > 0 && (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Departamento</th>
                <th>Papéis</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nome">{u.name}</td>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Departamento">{u.department?.name ?? '—'}</td>
                  <td data-label="Papéis">
                    {u.roles.map((r) => (
                      <span key={r} className={`badge ${r === 'ADMIN_MASTER' ? 'badge--danger' : r === 'ADMIN' ? 'badge--warning' : 'badge--neutral'}`} style={{ marginRight: 4 }}>
                        {ROLE_LABELS[r] ?? r}
                      </span>
                    ))}
                  </td>
                  <td data-label="Status">
                    <span className={`badge badge--${STATUS_BADGE_TONE[u.status] ?? 'neutral'}`}>{STATUS_LABELS[u.status] ?? u.status}</span>
                  </td>
                  <td data-label="Ações" className="table__actions">
                    {u.status === 'PENDING_APPROVAL' && (
                      <button type="button" className="btn btn--small btn--primary" onClick={() => onApprove(u.id)}>
                        Aprovar
                      </button>
                    )}
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setEditing(u)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setManagingRoles(u)}>
                      Papéis
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateUserModal
          departments={departments}
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            showToast('Usuário criado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          departments={departments}
          isSelf={editing.id === currentUser?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast('Usuário atualizado com sucesso!', 'success');
            load();
          }}
        />
      )}

      {managingRoles && (
        <RolesModal
          user={managingRoles}
          roles={roles}
          isSelf={managingRoles.id === currentUser?.id}
          onClose={() => setManagingRoles(null)}
          onSaved={() => {
            setManagingRoles(null);
            showToast('Papéis atualizados com sucesso!', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  departments,
  roles,
  onClose,
  onCreated,
}: {
  departments: Department[];
  roles: RoleCatalogItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [corporateId, setCorporateId] = useState('');
  const [position, setPosition] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['PARTICIPANTE']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(name: string) {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedRoles.length === 0) {
      setError('Selecione ao menos um papel.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/users', {
        name,
        email,
        password,
        corporateId: corporateId || undefined,
        position: position || undefined,
        departmentId: departmentId || undefined,
        birthDate: birthDate || undefined,
        gender: gender || undefined,
        roles: selectedRoles,
      });
      onCreated();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar o usuário.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <div className="form__row">
          <label className="field">
            <span className="field__label">Nome</span>
            <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Matrícula (opcional)</span>
            <input type="text" value={corporateId} onChange={(e) => setCorporateId(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="field__label">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Senha (mín. 6 caracteres)</span>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Cargo (opcional)</span>
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Departamento (opcional)</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Sem departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

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

        <fieldset className="field">
          <legend className="field__label">Papéis</legend>
          {roles.map((r) => (
            <label key={r.id} className="field field--checkbox">
              <input type="checkbox" checked={selectedRoles.includes(r.name)} onChange={() => toggleRole(r.name)} />
              <span>{ROLE_LABELS[r.name] ?? r.name}</span>
            </label>
          ))}
        </fieldset>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  departments,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  departments: Department[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(user.name);
  const [position, setPosition] = useState(user.position ?? '');
  const [departmentId, setDepartmentId] = useState(user.department?.id ?? '');
  const [birthDate, setBirthDate] = useState(user.birthDate ? user.birthDate.slice(0, 10) : '');
  const [gender, setGender] = useState(user.gender ?? '');
  const [status, setStatus] = useState(user.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/admin/users/${user.id}`, {
        name,
        position: position || null,
        departmentId: departmentId || null,
        birthDate: birthDate || null,
        gender: gender || null,
        status,
      });
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Editar usuário — ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}

        <label className="field">
          <span className="field__label">Nome</span>
          <input type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Cargo</span>
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Departamento</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Sem departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Data de nascimento</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
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

        <label className="field">
          <span className="field__label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isSelf}>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
            <option value="PENDING_APPROVAL">Pendente de aprovação</option>
          </select>
          {isSelf && <span className="field__hint">Você não pode desativar a própria conta.</span>}
        </label>

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RolesModal({
  user,
  roles,
  isSelf,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  roles: RoleCatalogItem[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemotingSelfFromMaster = isSelf && user.roles.includes('ADMIN_MASTER') && !selectedRoles.includes('ADMIN_MASTER');

  function toggleRole(name: string) {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedRoles.length === 0) {
      setError('Selecione ao menos um papel.');
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/admin/users/${user.id}/roles`, { roles: selectedRoles });
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível atualizar os papéis.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Papéis — ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        {error && <div className="alert alert--error">{error}</div>}
        <p>
          Conceder o papel <strong>Administrador</strong> ou <strong>Administrador Master</strong> dá acesso às telas
          administrativas da plataforma. Conceda com cuidado.
        </p>

        <fieldset className="field">
          <legend className="field__label">Papéis</legend>
          {roles.map((r) => (
            <label key={r.id} className="field field--checkbox">
              <input type="checkbox" checked={selectedRoles.includes(r.name)} onChange={() => toggleRole(r.name)} />
              <span>{ROLE_LABELS[r.name] ?? r.name}</span>
            </label>
          ))}
        </fieldset>

        {isDemotingSelfFromMaster && (
          <div className="alert alert--error">
            Você não pode remover o próprio acesso de Administrador Master.
          </div>
        )}

        <div className="form__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting || isDemotingSelfFromMaster}>
            {submitting ? 'Salvando…' : 'Salvar papéis'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
