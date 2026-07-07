import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FilterTrigger } from "../FilterTrigger";

export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Small sublabel under the legend row (e.g. "9.8s p95" or "Bedrock proxy"). */
  sub?: string;
  /** When set, the legend label becomes click-to-filter. */
  filter?: { attribute: string; values: string[]; label?: string };
}

export interface StackedBarProps {
  segments: StackedSegment[];
  /** Bar thickness in px. */
  height?: number;
  /** Format a segment's share for its legend (default: one-decimal percent). */
  formatShare?: (pct: number, seg: StackedSegment) => string;
  /** Format a segment's raw value for the hover tooltip (default: grouped
   *  integer). Pass a unit-aware formatter (e.g. fmtUSD / fmtTokens). */
  formatValue?: (seg: StackedSegment) => string;
}

/**
 * A single 100%-width horizontal stacked bar with a legend beneath it — the
 * right form for part-to-whole when one category dominates (a donut would be a
 * near-solid ring). Segments render left→right in the given order with a 2px
 * surface gap between them; the legend carries the identity so color is never
 * the only encoding.
 */
export const StackedBar = ({
  segments,
  height = 14,
  formatShare = (pct) => `${pct.toFixed(1)}%`,
  formatValue = (s) => s.value.toLocaleString("en-US"),
}: StackedBarProps) => {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shareOf = (s: StackedSegment) => (total > 0 ? (s.value / total) * 100 : 0);

  return (
    <Flex flexDirection="column" gap={12}>
      <div
        style={{
          display: "flex",
          gap: 2,
          height,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--surface-3)",
        }}
      >
        {segments.map((s) => {
          const pct = shareOf(s);
          if (pct <= 0) return null;
          return (
            <div
              key={s.key}
              title={`${s.label}: ${formatValue(s)} · ${formatShare(pct, s)}`}
              style={{ width: `${pct}%`, minWidth: 2, background: s.color }}
            />
          );
        })}
      </div>

      <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
        {segments.map((s) => (
          <Flex key={s.key} alignItems="center" gap={8} style={{ minWidth: 0 }}>
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
            <Flex flexDirection="column" gap={0} style={{ minWidth: 0, flex: 1 }}>
              <Text style={{ fontSize: 12.5, minWidth: 0 }}>
                {s.filter ? (
                  <FilterTrigger
                    attribute={s.filter.attribute}
                    value={s.filter.values}
                    label={s.filter.label ?? s.label}
                  >
                    {s.label}
                  </FilterTrigger>
                ) : (
                  s.label
                )}{" "}
                <Text
                  as="span"
                  style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}
                >
                  {formatShare(shareOf(s), s)}
                </Text>
              </Text>
              {s.sub && (
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{s.sub}</Text>
              )}
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
};
