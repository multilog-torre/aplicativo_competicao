import { ReactNode, useEffect, useState } from 'react';

/**
 * Painel de filtros flutuante, no estilo Power BI: um botão "Filtros" fica
 * visível no topo da página e, ao ser clicado, abre um painel ancorado à
 * direita por cima do conteúdo (com fundo escurecido atrás) — Esc, clique
 * fora ou o "✕" recolhem de volta. `hasActiveFilters` só controla o
 * destaque visual do botão (indica que existe algum filtro aplicado mesmo
 * com o painel fechado).
 */
export function FilterDrawer({ hasActiveFilters, children }: { hasActiveFilters: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`filter-drawer-toggle ${hasActiveFilters ? 'filter-drawer-toggle--active' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">🔽</span> Filtros
        {hasActiveFilters && <span className="filter-drawer-toggle__dot" aria-label="Filtros ativos" />}
      </button>

      {open && (
        <div className="filter-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="filter-drawer-panel" role="dialog" aria-modal="true" aria-label="Filtros" onClick={(e) => e.stopPropagation()}>
            <div className="filter-drawer-panel__header">
              <h2>Filtros</h2>
              <button type="button" className="filter-drawer-panel__close" aria-label="Fechar filtros" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="filter-drawer-panel__body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
