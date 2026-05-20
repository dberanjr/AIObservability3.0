import React from "react";

export interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  /** When true, fills the area below the line. */
  filled?: boolean;
}

/**
 * Responsive single-series sparkline.
 * Uses preserveAspectRatio="none" + non-scaling-stroke so it fills any tile width
 * without distorting stroke thickness (per DESIGN_HANDOFF §8 gotcha 2).
 */
export const Sparkline = ({
  values,
  color = "var(--blue)",
  height = 28,
  filled = true,
}: SparklineProps) => {
  if (values.length < 2) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      />
    );
  }
  const width = 100;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {filled && (
        <polygon
          points={areaPoints}
          fill={color}
          opacity={0.15}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
