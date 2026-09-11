/** Logo "Dados Competição" — ícone vetorial (3 barras em degrau, como um
 * equalizador/gráfico de barras) reproduzindo o mesmo ícone da marca, mais
 * o nome por extenso. Substitui o antigo "🏔️ Torre" em todo o app. */
export function Logo({ iconSize = 24 }: { iconSize?: number }) {
  return (
    <span className="brand-logo">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="brand-logo__icon"
      >
        <rect x="2" y="13" width="5" height="9" rx="2.5" fill="currentColor" />
        <rect x="9.5" y="7" width="5" height="15" rx="2.5" fill="currentColor" />
        <rect x="17" y="2" width="5" height="20" rx="2.5" fill="currentColor" />
      </svg>
      <span>Dados Competição</span>
    </span>
  );
}
