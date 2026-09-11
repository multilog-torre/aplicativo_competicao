import { useState } from 'react';

interface Point {
  label: string;
  value: number;
  /** Texto opcional pro topo do tooltip (ex.: "11/09/2026" ou o nome de um usuário).
   * Quando ausente, o tooltip usa `label`. */
  tooltipLabel?: string;
}

const CHART_HEIGHT = 180;
// Espaço reservado pros eixos: esquerda pra rótulos do eixo Y, baixo pro eixo X.
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

function niceValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Escolhe até `maxTicks` índices espalhados uniformemente (sempre incluindo o
 * primeiro e o último), pra não poluir o eixo X quando há muitos pontos. */
function pickTickIndexes(count: number, maxTicks: number): number[] {
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (maxTicks - 1);
  const indexes = new Set<number>();
  for (let i = 0; i < maxTicks; i++) indexes.add(Math.round(i * step));
  return Array.from(indexes).sort((a, b) => a - b);
}

/** Gráfico de linha simples, sem dependências externas (SVG responsivo via
 * viewBox), com eixos rotulados e tooltip ao passar o mouse em cada ponto. */
export function LineChart({ data, color = 'var(--color-accent)' }: { data: Point[]; color?: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) return null;

  const width = Math.max(data.length * 24, 320);
  const plotWidth = width - PAD_LEFT - PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const values = data.map((d) => d.value);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMin;
  const range = max - min || 1;
  const mid = (max + min) / 2;

  const points = data.map((d, i) => {
    const x = PAD_LEFT + (i / Math.max(data.length - 1, 1)) * plotWidth;
    const y = PAD_TOP + plotHeight - ((d.value - min) / range) * plotHeight;
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${PAD_TOP + plotHeight} L ${points[0].x.toFixed(1)} ${PAD_TOP + plotHeight} Z`;

  const yTicks = [max, mid, min];
  const xTickIndexes = pickTickIndexes(data.length, 6);

  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const hoveredDatum = hovered !== null ? data[hovered] : null;

  // Tooltip clampado dentro do viewBox pra não cortar nas bordas.
  const tooltipWidth = 120;
  const tooltipHeight = 40;
  let tooltipX = hoveredPoint ? hoveredPoint.x - tooltipWidth / 2 : 0;
  tooltipX = Math.max(PAD_LEFT - 4, Math.min(tooltipX, width - PAD_RIGHT - tooltipWidth + 4));
  const tooltipY = hoveredPoint ? Math.max(0, hoveredPoint.y - tooltipHeight - 10) : 0;

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} role="img" aria-label="Gráfico de evolução">
        {/* Linhas de grade + rótulos do eixo Y */}
        {yTicks.map((tick, i) => {
          const y = PAD_TOP + plotHeight - ((tick - min) / range) * plotHeight;
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} className="chart-grid-line" />
              <text x={PAD_LEFT - 6} y={y} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {niceValue(tick)}
              </text>
            </g>
          );
        })}

        {/* Rótulos do eixo X */}
        {xTickIndexes.map((i) => (
          <text key={i} x={points[i].x} y={CHART_HEIGHT - 6} className="chart-axis-label" textAnchor="middle">
            {data[i].label}
          </text>
        ))}

        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={hovered === i ? 4 : 2.5} fill={color} />
            {/* Alvo invisível maior, mais fácil de acertar com o mouse. */}
            <circle
              cx={p.x}
              cy={p.y}
              r="10"
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            />
          </g>
        ))}

        {hoveredPoint && hoveredDatum && (
          <g pointerEvents="none">
            <line x1={hoveredPoint.x} y1={PAD_TOP} x2={hoveredPoint.x} y2={PAD_TOP + plotHeight} className="chart-grid-line chart-grid-line--hover" />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" className="chart-tooltip-box" />
            <text x={tooltipX + tooltipWidth / 2} y={tooltipY + 16} textAnchor="middle" className="chart-tooltip-title">
              {hoveredDatum.tooltipLabel ?? hoveredDatum.label}
            </text>
            <text x={tooltipX + tooltipWidth / 2} y={tooltipY + 32} textAnchor="middle" className="chart-tooltip-value">
              {niceValue(hoveredDatum.value)} pts
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Gráfico de barras simples, sem dependências externas. O valor já fica
 * sempre visível ao lado da barra; o `title` nativo mostra o detalhe ao
 * passar o mouse, sem precisar de tooltip customizado. */
export function BarChart({ data, color = 'var(--color-accent)' }: { data: Point[]; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-chart__row" title={`${d.tooltipLabel ?? d.label}: ${d.value}`}>
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
