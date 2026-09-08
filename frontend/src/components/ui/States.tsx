interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="state-block state-block--loading">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, description }: EmptyStateProps) {
  return (
    <div className="state-block state-block--empty">
      <div className="state-block__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="state-block__title">{title}</p>
      {description && <p className="state-block__description">{description}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block state-block--error">
      <div className="state-block__icon" aria-hidden="true">
        ⚠️
      </div>
      <p className="state-block__title">Algo deu errado</p>
      <p className="state-block__description">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
