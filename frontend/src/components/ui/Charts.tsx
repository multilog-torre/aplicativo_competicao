interface Point {
  label: string;
  value: number;
}

const CHART_HEIGHT = 160;
const CHART_PADDING = 24;

/** Gráfico de linha simples, sem dependências externas (SVG responsivo via viewBox). */
export function LineChart({ data, color = 'var(--color-accent)' }: { data: Point[]; color?: string }) {
  if (data.length === 0) return null;
  const width = Math.max(data.length * 24, 320);
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = CHART_PADDING + (i / Math.max(data.length - 1, 1)) * (width - CHART_PADDING * 2);
    const y = CHART_HEIGHT - CHART_PADDING - ((d.value - min) / range) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${CHART_HEIGHT - CHART_PADDING} L ${points[0].x.toFixed(1)} ${CHART_HEIGHT - CHART_PADDING} Z`;

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} role="img" aria-label="Gráfico de evolução">
        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  );
}

/** Gráfico de barras simples, sem dependências externas. */
export function BarChart({ data, color = 'var(--color-accent)' }: { data: Point[]; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-chart__row">
          <span className="bar-chart__label" title={d.label}>
            {d.label}
          </span>
          <div className="bar-chart__track">
            <div
              className="bar-chart__fill"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="bar-chart__value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
