import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Optional sublabel rendered under the legend label (e.g. "12% (Bedrock proxy)"). */
  sub?: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  /** Big number rendered in the center. */
  centerValue?: string;
  /** Small caption under the center value. */
  centerLabel?: string;
  size?: number;
  thickness?: number;
}

const arcPath = (
  cx: number,
  cy: number,
  r: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string => {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + Math.cos(startAngle) * r;
  const y1 = cy + Math.sin(startAngle) * r;
  const x2 = cx + Math.cos(endAngle) * r;
  const y2 = cy + Math.sin(endAngle) * r;
  const xi1 = cx + Math.cos(endAngle) * rInner;
  const yi1 = cy + Math.sin(endAngle) * rInner;
  const xi2 = cx + Math.cos(startAngle) * rInner;
  const yi2 = cy + Math.sin(startAngle) * rInner;
  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    `L ${xi1} ${yi1}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${xi2} ${yi2}`,
    "Z",
  ].join(" ");
};

export const Donut = ({
  slices,
  centerValue,
  centerLabel,
  size = 140,
  thickness = 22,
}: DonutProps) => {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const rInner = r - thickness;

  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    return { slice: s, d: arcPath(cx, cy, r, rInner, start, end), frac };
  });

  return (
    <Flex alignItems="center" gap={16}>
      <div
        style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}
      >
        <svg width={size} height={size} role="img" aria-label="Provider mix">
          <circle cx={cx} cy={cy} r={r} fill="var(--surface-2)" />
          {arcs.map(({ slice, d }) =>
            d ? <path key={slice.key} d={d} fill={slice.color} /> : null,
          )}
          <circle cx={cx} cy={cy} r={rInner} fill="var(--surface)" />
        </svg>
        {(centerValue || centerLabel) && (
          <Flex
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {centerValue && (
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {centerValue}
              </Text>
            )}
            {centerLabel && (
              <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                {centerLabel}
              </Text>
            )}
          </Flex>
        )}
      </div>

      <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <Flex key={s.key} alignItems="center" gap={8}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: s.color,
                  flex: "0 0 auto",
                }}
              />
              <Flex flexDirection="column" gap={0}>
                <Text style={{ fontSize: 12.5 }}>
                  {s.label}{" "}
                  <Text
                    as="span"
                    style={{
                      color: "var(--text-3)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {pct.toFixed(1)}%
                  </Text>
                </Text>
                {s.sub && (
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {s.sub}
                  </Text>
                )}
              </Flex>
            </Flex>
          );
        })}
      </Flex>
    </Flex>
  );
};
