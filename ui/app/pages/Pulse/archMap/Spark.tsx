/**
 * Sparkline / area chart for tier span-volume series. Used small inline on node
 * cards and larger in the drawer + detail modal. Pure SVG; hovering reveals the
 * value at the nearest point (guide line + dot + readout).
 */
import React, { useState } from "react";

interface Props {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  area?: boolean;
  /** Stretch to fill the container width (drawer / modal). */
  fluid?: boolean;
  /** Optional formatter for the hover readout (defaults to grouped integer). */
  format?: (v: number) => string;
  /** Optional per-point labels (e.g. bucket times) shown in the hover readout. */
  labels?: string[];
}

const defaultFmt = (v: number): string => Math.round(v).toLocaleString("en-US");

export const Spark = ({
  data,
  color,
  width = 88,
  height = 26,
  area = true,
  fluid = false,
  format = defaultFmt,
  labels,
}: Props) => {
  const [hi, setHi] = useState<number | null>(null);
  if (!data || data.length < 2) return null;

  // Guard against non-finite values (e.g. a null percentile bucket) — a single
  // NaN would make min/max NaN and blank the whole line.
  const safe = data.map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...safe);
  const min = Math.min(...safe);
  const x = (i: number) => (i / (safe.length - 1)) * width;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const pts = safe.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
    setHi(Math.round(frac * (safe.length - 1)));
  };

  const xPct = hi != null ? (hi / (safe.length - 1)) * 100 : 0;
  const yPct = hi != null ? (y(safe[hi]) / height) * 100 : 0;

  return (
    <div
      className="am-spark-wrap"
      style={{ width: fluid ? "100%" : width, height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHi(null)}
    >
      <svg
        className="am-mini"
        width={fluid ? "100%" : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {area && <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={color} opacity={0.12} />}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {hi != null && (
        <>
          <span className="am-spark-guide" style={{ left: `${xPct}%` }} />
          <span className="am-spark-dot" style={{ left: `${xPct}%`, top: `${yPct}%`, background: color }} />
          <span className="am-spark-val" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
            {format(safe[hi])}
            {labels && labels[hi] ? ` · ${labels[hi]}` : ""}
          </span>
        </>
      )}
    </div>
  );
};
