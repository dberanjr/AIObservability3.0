/**
 * Compact labeled-value stat used by the capability-gated panels. Mirrors the
 * KPI-card look used elsewhere (uppercase label + large value + optional sub).
 */

import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

export interface MiniStatProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export const MiniStat = ({ label, value, sub, color }: MiniStatProps) => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={4} style={{ minWidth: 0 }}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 600, color: color ?? "var(--text)" }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sub}</Text>
      )}
    </Flex>
  </Surface>
);
