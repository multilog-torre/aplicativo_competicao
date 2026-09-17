import { ReactNode, useState } from 'react';
import { Modal } from './Modal';

export interface Point {
  label: string;
  value: number;
  /** Texto opcional pro topo do tooltip (ex.: "11/09/2026" ou o nome de um usuário).
   * Quando ausente, o tooltip usa `label`. */
  tooltipLabel?: string;
  /** Segunda linha opcional do rótulo, do BarChart — ex.: o nome da pessoa em
   * destaque, abaixo do nome da modalidade. Sempre visível (não só no hover),
   * diferente de tooltipLabel. */
  sublabel?: string;
}

/** Granularidade dos gráficos de histórico de pontos (Painel Geral e
 * Dashboard pessoal) — mesmo shape usado pelo backend em `pointsHistory`. */
export type PointsHistoryGranularity = 'day' | 'month' | 'year';

const GRANULARITY_OPTIONS: Array<{ key: PointsHistoryGranularity; label: string }> = [
  { key: 'day', label: 'Dia' },
  { key: 'month', label: 'Mês' },
  { key: 'year', label: 'Ano' },
];

/** Abas Dia/Mês/Ano compactas, pensadas pro cabeçalho de um ChartCard —
 * reaproveitada pelo Painel Geral e pelo Dashboard pessoal. */
export function GranularityTabs({ value, onChange }: { value: PointsHistoryGranularity; onChange: (v: PointsHistoryGranularity) => void }) {
  return (
    <div className="tabs tabs--compact">
      {GRANULARITY_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`tabs__item ${value === opt.key ? 'tabs__item--active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Uma linha do gráfico multi-série (ex.: um usuário na "Evolução dos usuários"). */
export interface Series {
  id: string;
  name: string;
  color?: string;
  data: Point[];
}

/** "default" é o tamanho normal dentro do card; "large" é usado dentro do
 * modal de zoom — fontes, espessura de linha e alvos de clique bem maiores,
 * pra ler de mais longe/numa tela grande. */
export type ChartSize = 'default' | 'large';

const SIZE_CONFIG = {
  default: {
    height: 190,
    padLeft: 42,
    padRight: 14,
    padTop: 18,
    padBottom: 28,
    strokeWidth: 2.5,
    pointR: 2.5,
    pointRHover: 4.5,
    hitR: 11,
    tooltipWidth: 128,
    tooltipHeight: 42,
  },
  large: {
    height: 440,
    padLeft: 64,
    padRight: 24,
    padTop: 28,
    padBottom: 44,
    strokeWidth: 3.5,
    pointR: 4,
    pointRHover: 7,
    hitR: 16,
    tooltipWidth: 180,
    tooltipHeight: 58,
  },
};

const DEFAULT_PALETTE = [
  'var(--color-accent)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-danger)',
  '#8b5cf6', // roxo — só entra se houver um 5º usuário além das 4 cores semânticas
];

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

/**
 * Card padrão de gráfico: título sempre centralizado no topo, controles
 * extra (ex.: abas Dia/Mês/Ano) no canto superior esquerdo, e o botão de
 * zoom flutuando no canto inferior direito da área do gráfico — o gráfico
 * em si ocupa o centro, usando toda a largura/altura disponível do card.
 * O zoom abre o mesmo conteúdo ampliado (`size="large"`) num modal.
 */
export function ChartCard({
  title,
  actions,
  children,
}: {
  title: string;
  /** Controles extra no canto superior esquerdo do card (ex.: as abas Dia/Mês/Ano). */
  actions?: ReactNode;
  children: (size: ChartSize) => ReactNode;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div className="chart-card card">
      <h2 className="chart-card__title">{title}</h2>
      {actions && <div className="chart-card__actions-row">{actions}</div>}
      <div className="chart-card__body">
        {children('default')}
        <button type="button" className="chart-zoom-btn chart-zoom-btn--floating" onClick={() => setZoomed(true)} title="Ampliar gráfico" aria-label="Ampliar gráfico">
          🔍
        </button>
      </div>
      {zoomed && (
        <Modal title={title} onClose={() => setZoomed(false)} className="modal--wide">
          <div className="chart-zoom-modal-body">{children('large')}</div>
        </Modal>
      )}
    </div>
  );
}

/** Gráfico de linha simples, sem dependências externas (SVG responsivo via
 * viewBox), com eixos rotulados e tooltip ao passar o mouse em cada ponto. */
export function LineChart({ data, color = 'var(--color-accent)', size = 'default' }: { data: Point[]; color?: string; size?: ChartSize }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) return null;
  const cfg = SIZE_CONFIG[size];

  const width = Math.max(data.length * (size === 'large' ? 40 : 24), size === 'large' ? 640 : 320);
  const plotWidth = width - cfg.padLeft - cfg.padRight;
  const plotHeight = cfg.height - cfg.padTop - cfg.padBottom;

  const values = data.map((d) => d.value);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMin;
  const range = max - min || 1;
  const mid = (max + min) / 2;

  const points = data.map((d, i) => {
    const x = cfg.padLeft + (i / Math.max(data.length - 1, 1)) * plotWidth;
    const y = cfg.padTop + plotHeight - ((d.value - min) / range) * plotHeight;
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${cfg.padTop + plotHeight} L ${points[0].x.toFixed(1)} ${cfg.padTop + plotHeight} Z`;

  const yTicks = [max, mid, min];
  const xTickIndexes = pickTickIndexes(data.length, size === 'large' ? 10 : 6);

  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const hoveredDatum = hovered !== null ? data[hovered] : null;

  // Tooltip clampado dentro do viewBox pra não cortar nas bordas.
  let tooltipX = hoveredPoint ? hoveredPoint.x - cfg.tooltipWidth / 2 : 0;
  tooltipX = Math.max(cfg.padLeft - 4, Math.min(tooltipX, width - cfg.padRight - cfg.tooltipWidth + 4));
  const tooltipY = hoveredPoint ? Math.max(0, hoveredPoint.y - cfg.tooltipHeight - 10) : 0;

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${cfg.height}`} width="100%" height={cfg.height} role="img" aria-label="Gráfico de evolução">
        {/* Linhas de grade + rótulos do eixo Y */}
        {yTicks.map((tick, i) => {
          const y = cfg.padTop + plotHeight - ((tick - min) / range) * plotHeight;
          return (
            <g key={i}>
              <line x1={cfg.padLeft} y1={y} x2={width - cfg.padRight} y2={y} className="chart-grid-line" />
              <text x={cfg.padLeft - 6} y={y} className={`chart-axis-label ${size === 'large' ? 'chart-axis-label--large' : ''}`} textAnchor="end" dominantBaseline="middle">
                {niceValue(tick)}
              </text>
            </g>
          );
        })}

        {/* Rótulos do eixo X */}
        {xTickIndexes.map((i) => (
          <text key={i} x={points[i].x} y={cfg.height - 6} className={`chart-axis-label ${size === 'large' ? 'chart-axis-label--large' : ''}`} textAnchor="middle">
            {data[i].label}
          </text>
        ))}

        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={path} fill="none" stroke={color} strokeWidth={cfg.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={hovered === i ? cfg.pointRHover : cfg.pointR} fill={color} />
            {/* Alvo invisível maior, mais fácil de acertar com o mouse. */}
            <circle
              cx={p.x}
              cy={p.y}
              r={cfg.hitR}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            />
          </g>
        ))}

        {hoveredPoint && hoveredDatum && (
          <g pointerEvents="none">
            <line x1={hoveredPoint.x} y1={cfg.padTop} x2={hoveredPoint.x} y2={cfg.padTop + plotHeight} className="chart-grid-line chart-grid-line--hover" />
            <rect x={tooltipX} y={tooltipY} width={cfg.tooltipWidth} height={cfg.tooltipHeight} rx="6" className="chart-tooltip-box" />
            <text x={tooltipX + cfg.tooltipWidth / 2} y={tooltipY + cfg.tooltipHeight * 0.4} textAnchor="middle" className={`chart-tooltip-title ${size === 'large' ? 'chart-tooltip-title--large' : ''}`}>
              {hoveredDatum.tooltipLabel ?? hoveredDatum.label}
            </text>
            <text x={tooltipX + cfg.tooltipWidth / 2} y={tooltipY + cfg.tooltipHeight * 0.78} textAnchor="middle" className={`chart-tooltip-value ${size === 'large' ? 'chart-tooltip-value--large' : ''}`}>
              {niceValue(hoveredDatum.value)} pts
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Gráfico de múltiplas linhas compartilhando o mesmo eixo X (ex.: "Evolução
 * dos usuários" — uma linha por usuário). Ao passar o mouse sobre uma
 * coluna, o tooltip mostra os valores de TODAS as séries naquele ponto,
 * ordenados do maior pro menor. A legenda é clicável (`onSeriesClick`) —
 * usada pra filtrar o painel por aquele usuário quando informado.
 */
export function MultiLineChart({
  series,
  size = 'default',
  onSeriesClick,
  emptyMessage = 'Sem dados para exibir.',
}: {
  series: Series[];
  size?: ChartSize;
  onSeriesClick?: (seriesId: string) => void;
  emptyMessage?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const nonEmptySeries = series.filter((s) => s.data.length > 0);
  if (nonEmptySeries.length === 0) {
    return <p className="chart-empty-message">{emptyMessage}</p>;
  }
  const cfg = SIZE_CONFIG[size];
  const pointCount = nonEmptySeries[0].data.length;

  const width = Math.max(pointCount * (size === 'large' ? 40 : 24), size === 'large' ? 640 : 320);
  const plotWidth = width - cfg.padLeft - cfg.padRight;
  const plotHeight = cfg.height - cfg.padTop - cfg.padBottom;

  const allValues = nonEmptySeries.flatMap((s) => s.data.map((d) => d.value));
  const rawMax = Math.max(...allValues, 0);
  const rawMin = Math.min(...allValues, 0);
  const max = rawMax === rawMin ? rawMax + 1 : rawMax;
  const min = rawMin;
  const range = max - min || 1;
  const mid = (max + min) / 2;

  const colored = nonEmptySeries.map((s, i) => ({ ...s, resolvedColor: s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] }));

  const seriesPoints = colored.map((s) => ({
    ...s,
    points: s.data.map((d, i) => ({
      x: cfg.padLeft + (i / Math.max(pointCount - 1, 1)) * plotWidth,
      y: cfg.padTop + plotHeight - ((d.value - min) / range) * plotHeight,
      value: d.value,
      label: d.label,
      tooltipLabel: d.tooltipLabel,
    })),
  }));

  const xTickIndexes = pickTickIndexes(pointCount, size === 'large' ? 10 : 6);
  const yTicks = [max, mid, min];

  const hoveredX = hovered !== null ? seriesPoints[0]?.points[hovered]?.x ?? null : null;
  const tooltipRows =
    hovered !== null
      ? seriesPoints
          .map((s) => ({ name: s.name, color: s.resolvedColor, value: s.points[hovered]?.value ?? 0 }))
          .sort((a, b) => b.value - a.value)
      : [];
  const tooltipTitle = hovered !== null ? seriesPoints[0]?.points[hovered]?.tooltipLabel ?? seriesPoints[0]?.points[hovered]?.label : '';

  const tooltipHeight = 22 + tooltipRows.length * (size === 'large' ? 22 : 17);
  const tooltipWidth = size === 'large' ? 220 : 160;
  let tooltipX = hoveredX !== null ? hoveredX - tooltipWidth / 2 : 0;
  tooltipX = Math.max(cfg.padLeft - 4, Math.min(tooltipX, width - cfg.padRight - tooltipWidth + 4));
  const tooltipY = cfg.padTop + 4;

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${cfg.height}`} width="100%" height={cfg.height} role="img" aria-label="Gráfico comparativo de evolução">
        {yTicks.map((tick, i) => {
          const y = cfg.padTop + plotHeight - ((tick - min) / range) * plotHeight;
          return (
            <g key={i}>
              <line x1={cfg.padLeft} y1={y} x2={width - cfg.padRight} y2={y} className="chart-grid-line" />
              <text x={cfg.padLeft - 6} y={y} className={`chart-axis-label ${size === 'large' ? 'chart-axis-label--large' : ''}`} textAnchor="end" dominantBaseline="middle">
                {niceValue(tick)}
              </text>
            </g>
          );
        })}

        {xTickIndexes.map((i) => (
          <text key={i} x={seriesPoints[0].points[i].x} y={cfg.height - 6} className={`chart-axis-label ${size === 'large' ? 'chart-axis-label--large' : ''}`} textAnchor="middle">
            {seriesPoints[0].points[i].label}
          </text>
        ))}

        {/* Coluna inteira clicável/hoverável (mais fácil de acertar que um ponto). */}
        {seriesPoints[0].points.map((p, i) => (
          <rect
            key={i}
            x={p.x - plotWidth / Math.max(pointCount, 1) / 2}
            y={cfg.padTop}
            width={plotWidth / Math.max(pointCount, 1)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          />
        ))}

        {seriesPoints.map((s) => {
          const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          return <path key={s.id} d={path} fill="none" stroke={s.resolvedColor} strokeWidth={cfg.strokeWidth} strokeLinejoin="round" strokeLinecap="round" opacity={hovered === null ? 1 : 0.9} />;
        })}
        {seriesPoints.map((s) =>
          hovered !== null ? (
            <circle key={s.id} cx={s.points[hovered].x} cy={s.points[hovered].y} r={cfg.pointRHover} fill={s.resolvedColor} pointerEvents="none" />
          ) : null,
        )}

        {hovered !== null && hoveredX !== null && (
          <g pointerEvents="none">
            <line x1={hoveredX} y1={cfg.padTop} x2={hoveredX} y2={cfg.padTop + plotHeight} className="chart-grid-line chart-grid-line--hover" />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" className="chart-tooltip-box" />
            <text x={tooltipX + tooltipWidth / 2} y={tooltipY + 16} textAnchor="middle" className={`chart-tooltip-title ${size === 'large' ? 'chart-tooltip-title--large' : ''}`}>
              {tooltipTitle}
            </text>
            {tooltipRows.map((row, i) => (
              <g key={row.name} transform={`translate(${tooltipX + 10}, ${tooltipY + 30 + i * (size === 'large' ? 22 : 17)})`}>
                <circle cx={4} cy={-4} r={4} fill={row.color} />
                <text x={12} y={0} className={`chart-tooltip-legend ${size === 'large' ? 'chart-tooltip-legend--large' : ''}`}>
                  {row.name}
                </text>
                <text x={tooltipWidth - 20} y={0} textAnchor="end" className={`chart-tooltip-legend chart-tooltip-legend--value ${size === 'large' ? 'chart-tooltip-legend--large' : ''}`}>
                  {niceValue(row.value)}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>

      <div className="multi-line-legend">
        {colored.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`multi-line-legend__item ${onSeriesClick ? 'multi-line-legend__item--clickable' : ''}`}
            onClick={onSeriesClick ? () => onSeriesClick(s.id) : undefined}
            disabled={!onSeriesClick}
            title={onSeriesClick ? `Filtrar o painel por ${s.name}` : s.name}
          >
            <span className="multi-line-legend__swatch" style={{ background: s.resolvedColor }} />
            {s.name}
          </button>
        ))}
      </div>
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
          <span className="bar-chart__label">
            <span className="bar-chart__label-line" title={d.label}>
              {d.label}
            </span>
            {d.sublabel && (
              <span className="bar-chart__label-sub" title={d.sublabel}>
                {d.sublabel}
              </span>
            )}
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
