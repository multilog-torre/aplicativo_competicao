import { useEffect, useState } from 'react';
import { API_URL, getToken } from './client';

// Tentativas extras antes de desistir de verdade, com um pequeno intervalo
// crescente entre elas — cobre as falhas passageiras mais comuns (Render
// "acordando" depois de hibernar por inatividade, ou uma instabilidade
// pontual buscando o arquivo no Cloudinary; ver docs/INTEGRACAO.md). Sem
// isso, uma única falha de rede fazia a foto nunca mais aparecer até a
// pessoa recarregar a página inteira (o que força um novo mount e, essa
// segunda vez, o serviço já está "desperto").
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca uma imagem protegida por Authorization (evidências, fotos do mural,
 * avatares) e devolve uma object URL local — <img src> não consegue enviar
 * cabeçalhos de autenticação diretamente.
 */
export function useAuthedImage(path: string | null | undefined): { url: string | null; loading: boolean; error: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(false);

    const token = getToken();

    async function loadWithRetry() {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!res.ok) throw new Error('Falha ao carregar imagem');
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
          return;
        } catch {
          if (cancelled) return;
          if (attempt === MAX_RETRIES) {
            setError(true);
            return;
          }
          await delay(RETRY_DELAY_MS * (attempt + 1));
          if (cancelled) return;
        }
      }
    }

    loadWithRetry().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { url, loading, error };
}
