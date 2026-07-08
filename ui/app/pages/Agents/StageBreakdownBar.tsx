import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtPercent } from "../../data/format";
import { STAGE_META, stageMixLabel } from "./stageMix";
import type { StageBreakdown } from "./useAgents";

export interface StageBreakdownBarProps {
  stage: StageBreakdown;
  height?: number;
  showLegend?: boolean;
}

export const StageBreakdownBar = ({
  stage,
  height = 8,
  showLegend = false,
}: StageBreakdownBarProps) => (
  <Flex flexDirection="column" gap={4}>
    <div
      style={{
        display: "flex",
        height,
        borderRadius: height,
        background: "var(--surface-3)",
        overflow: "hidden",
        width: "100%",
      }}
      role="img"
      aria-label={stageMixLabel(stage)}
    >
      {STAGE_META.map((s) => {
        const frac = stage[s.key];
        if (frac <= 0) return null;
        return (
          <div
            key={s.key}
            style={{
              width: `${(frac * 100).toFixed(2)}%`,
              background: s.color,
            }}
            title={`${s.label}: ${fmtPercent(frac * 100)}`}
          />
        );
      })}
    </div>
    {showLegend && (
      <Flex gap={8} style={{ flexWrap: "wrap" }}>
        {STAGE_META.map((s) => (
          <Flex key={s.key} alignItems="center" gap={4}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: s.color,
              }}
            />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {s.label} {(stage[s.key] * 100).toFixed(0)}%
            </Text>
          </Flex>
        ))}
      </Flex>
    )}
  </Flex>
);
