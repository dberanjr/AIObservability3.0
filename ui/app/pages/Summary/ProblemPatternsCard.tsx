import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount } from "../../data/format";
import { useTabNav, type FocusParam } from "../../lib/nav";
import { SummaryCard } from "./SummaryCard";
import {
  useProblemPatternCounts,
  type ProblemPatternCount,
} from "./useProblemPatternCounts";

const CLASS_COLOR: Record<ProblemPatternCount["cls"], string> = {
  "same-span": "var(--pink)",
  "cross-span": "var(--purple-2)",
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <Flex alignItems="center" gap={6}>
    <span
      aria-hidden
      style={{ width: 8, height: 8, borderRadius: "50%", background: color }}
    />
    <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>{label}</Text>
  </Flex>
);

const PatternRow = ({
  p,
  max,
  onDrive,
}: {
  p: ProblemPatternCount;
  max: number;
  onDrive: (p: ProblemPatternCount) => void;
}) => {
  const pct = max > 0 ? (Math.sqrt(p.count) / Math.sqrt(max)) * 100 : 0;
  const color = CLASS_COLOR[p.cls];
  return (
    <button
      type="button"
      onClick={() => onDrive(p)}
      className="aiobs-pattern-row"
      title={`${p.label}: ${fmtCount(p.count)} match${p.count === 1 ? "" : "es"} · click to drive the board`}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "6px 6px",
        borderRadius: 6,
      }}
    >
      <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
        <Text
          style={{
            fontSize: 12.5,
            color: "var(--text-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.label}
          {p.approximate && (
            <Text as="span" style={{ color: "var(--text-3)" }} title="approximate (proxy signal)">
              {" "}
              ≈
            </Text>
          )}
        </Text>
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "var(--text)",
            flex: "0 0 auto",
          }}
        >
          {p.truncated ? `${fmtCount(p.count)}+` : fmtCount(p.count)}
        </Text>
      </Flex>
      <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct.toFixed(1)}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </button>
  );
};

/**
 * The problem-pattern detector list — every architecture detector ranked by
 * match volume, split same-span vs cross-span (the real classes from
 * focus.ts). Clicking a pattern drives the board: it drills to Prompts with the
 * detector's `?focus` preset (the same mechanism the Pulse map + Prompts sidebar
 * use), so the findings/board scope to that pattern.
 */
export const ProblemPatternsCard = () => {
  const { patterns, isLoading } = useProblemPatternCounts();
  const goToTab = useTabNav();
  const max = Math.max(1, ...patterns.map((p) => p.count));

  const onDrive = (p: ProblemPatternCount) =>
    goToTab("/prompts", { focus: p.id as FocusParam });

  const byCount = (a: ProblemPatternCount, b: ProblemPatternCount) => b.count - a.count;
  const detectors = patterns.filter((p) => !p.approximate).sort(byCount);
  const proxies = patterns.filter((p) => p.approximate).sort(byCount);

  const renderGroup = (eyebrow: string, group: ProblemPatternCount[]) => {
    if (group.length === 0) return null;
    const half = Math.ceil(group.length / 2);
    const cols = [group.slice(0, half), group.slice(half)];
    return (
      <Flex flexDirection="column" gap={6}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {eyebrow}
        </Text>
        <Flex gap={16} alignItems="flex-start">
          {cols.map((col, ci) => (
            <Flex key={ci} flexDirection="column" gap={2} style={{ flex: 1, minWidth: 0 }}>
              {col.map((p) => (
                <PatternRow key={p.id} p={p} max={max} onDrive={onDrive} />
              ))}
            </Flex>
          ))}
        </Flex>
      </Flex>
    );
  };

  return (
    <SummaryCard
      title="Problem patterns"
      subtitle={`${patterns.length || 11} detectors · ranked by match volume · click to drive the board`}
      drill={{ label: "Prompts", to: "/prompts" }}
      headerRight={
        <Flex gap={12}>
          <LegendDot color={CLASS_COLOR["same-span"]} label="same-span" />
          <LegendDot color={CLASS_COLOR["cross-span"]} label="cross-span" />
        </Flex>
      }
    >
      <style>{`.aiobs-pattern-row:hover{background:var(--surface-2)}`}</style>
      {isLoading && patterns.length === 0 ? (
        <Flex gap={16}>
          {[0, 1].map((c) => (
            <Flex key={c} flexDirection="column" gap={12} style={{ flex: 1 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} style={{ height: 26, borderRadius: 6 }} />
              ))}
            </Flex>
          ))}
        </Flex>
      ) : (
        <Flex flexDirection="column" gap={16}>
          {renderGroup("Problem detectors", detectors)}
          {renderGroup("Proxy signals ≈", proxies)}
        </Flex>
      )}
    </SummaryCard>
  );
};
