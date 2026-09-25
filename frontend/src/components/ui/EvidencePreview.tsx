import { useState } from 'react';
import { API_URL, getToken } from '../../api/client';
import { EvidenceItem } from '../../types/api';
import { useAuthedImage } from '../../api/useAuthedImage';

/** Pré-visualiza imagens inline; para outros tipos (PDF, TXT), oferece abrir em nova aba — sempre autenticado. */
export function EvidencePreview({ evidence }: { evidence: EvidenceItem }) {
  const isImage = evidence.fileType.startsWith('image/');
  // evidence.downloadUrl já vem com o prefixo "/api/v1" embutido (evidence.service.ts /
  // event-evidence.service.ts), enquanto API_URL/useAuthedImage já incluem esse mesmo
  // prefixo — removê-lo aqui evita duplicar "/api/v1/api/v1/..." na requisição.
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
