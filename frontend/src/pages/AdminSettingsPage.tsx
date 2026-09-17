import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { SystemSettings } from '../types/api';
import { LoadingState, ErrorState } from '../components/ui/States';
import { useToast } from '../context/ToastContext';

/**
 * Configurações do sistema — hoje só a de aprovação automática de
 * atividades. Restrita a ADMIN_MASTER (mesma régua da auditoria e da
 * gestão de contas), porque desligar isso reativa a regra de que um
 * administrador precisa validar cada atividade antes dos pontos serem
 * creditados.
 */
export function AdminSettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setError(null);
    api
      .get<SystemSettings>('/settings')
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as configurações.'));
  }

  useEffect(load, []);

  async function handleToggleAutoApprove(checked: boolean) {
    if (!settings) return;
    setSaving(true);
    // Otimista: reflete na tela na hora, sem esperar a resposta.
    const previous = settings;
    setSettings({ ...settings, autoApproveActivities: checked });
    try {
      const { data } = await api.patch<SystemSettings>('/settings', { autoApproveActivities: checked });
      setSettings(data);
      showToast(
        checked
          ? 'Aprovação automática ativada — novas atividades serão aprovadas sozinhas, sem esperar um administrador.'
          : 'Aprovação automática desativada — atividades voltam a esperar aprovação manual em Admin > Aprovações.',
        'success',
      );
    } catch (err) {
      setSettings(previous);
      showToast(err instanceof ApiError ? err.message : 'Não foi possível salvar a configuração.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Carregando configurações…" />;

  return (
    <div className="page">
      <h1 className="page__title">Configurações</h1>
      <p className="page__subtitle">Comportamentos globais do sistema, aplicados a todas as modalidades de uma vez.</p>

      <section className="card">
        <h2 className="card__title">Aprovação de atividades</h2>
        <p>
          Por padrão, toda atividade registrada é <strong>aprovada automaticamente</strong> — sem esperar um
          administrador — e os pontos já são creditados na hora. Modalidades que exigem evidência só aprovam
          sozinhas depois que a evidência é enviada; sem evidência anexada, a atividade continua aguardando na fila
          de <strong>Admin &gt; Aprovações</strong>.
        </p>
        <p>Desligando esta opção, o sistema volta ao comportamento anterior: toda atividade espera um administrador aprovar ou rejeitar manualmente, sem exceção.</p>

        <label className="field field--checkbox" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.autoApproveActivities}
            disabled={saving}
            onChange={(e) => handleToggleAutoApprove(e.target.checked)}
          />
          <span>Aprovar atividades automaticamente (vale para todas as modalidades)</span>
        </label>

        <p className="field__hint" style={{ marginTop: 8 }}>
          Status atual: {settings.autoApproveActivities ? '✅ Ativada' : '⛔ Desativada — aprovação manual em vigor'}
        </p>
      </section>
    </div>
  );
}
