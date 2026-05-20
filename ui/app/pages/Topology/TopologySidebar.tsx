import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Switch, Checkbox } from "@dynatrace/strato-components/forms";
import type { Tier, TopologyGraphData } from "./useTopology";
import { TIER_COLORS, TIER_DISPLAY } from "./useTopology";

const TIERS: Tier[] = ["service", "agent", "tool", "model"];

const STATUS_ROWS: { color: string; label: string }[] = [
  { color: "var(--green-2)", label: "Healthy · error rate < 1%" },
  { color: "var(--amber)", label: "Warning · error rate < 5%" },
  { color: "var(--red)", label: "Critical · error rate ≥ 5%" },
];

const SegLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-3)",
    }}
  >
    {children}
  </Text>
);

const IntelCallout = () => (
  <Flex
    alignItems="flex-start"
    gap={8}
    style={{
      padding: "10px 12px",
      borderRadius: 8,
      background: "var(--intel-soft)",
      border: "1px solid color-mix(in oklab, var(--purple) 30%, transparent)",
    }}
  >
    <Text
      style={{
        fontSize: 11.5,
        color: "var(--text)",
        lineHeight: 1.4,
      }}
    >
      <strong style={{ color: "var(--purple)" }}>
        Dynatrace Intelligence
      </strong>{" "}
      stitches services, agents, tools, and models from span attributes — even
      across teams that instrument with different conventions.
    </Text>
  </Flex>
);

export interface TopologySidebarProps {
  graph: TopologyGraphData;
  hiddenTiers: Set<Tier>;
  onToggleTier: (tier: Tier) => void;
  showCriticalPath: boolean;
  onToggleCriticalPath: (next: boolean) => void;
}

export const TopologySidebar = ({
  graph,
  hiddenTiers,
  onToggleTier,
  showCriticalPath,
  onToggleCriticalPath,
}: TopologySidebarProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={16} style={{ width: 210 }}>
      <Flex flexDirection="column" gap={4}>
        <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>
          Static layered DAG · 4 tiers (services → agents → tools → models)
          derived from co-occurring span attributes.
        </Text>
      </Flex>

      <Flex flexDirection="column" gap={6}>
        <SegLabel>Show nodes</SegLabel>
        <Flex flexDirection="column" gap={4}>
          {TIERS.map((tier) => (
            <Flex
              key={tier}
              alignItems="center"
              gap={6}
              style={{ padding: "2px 4px" }}
            >
              <Checkbox
                name={`tier-${tier}`}
                value={!hiddenTiers.has(tier)}
                onChange={() => onToggleTier(tier)}
                aria-label={TIER_DISPLAY[tier]}
              />
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: TIER_COLORS[tier],
                }}
              />
              <Text style={{ fontSize: 12.5, flex: 1, color: "var(--text)" }}>
                {TIER_DISPLAY[tier]}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {graph.byTier[tier].length}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Flex>

      <Flex flexDirection="column" gap={6}>
        <SegLabel>Status</SegLabel>
        <Flex flexDirection="column" gap={4}>
          {STATUS_ROWS.map((row) => (
            <Flex key={row.label} alignItems="center" gap={6}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: row.color,
                }}
              />
              <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                {row.label}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Flex>

      <Flex flexDirection="column" gap={6}>
        <SegLabel>Overlays</SegLabel>
        <Flex alignItems="center" gap={6}>
          <Switch
            name="critical-path"
            value={showCriticalPath}
            onChange={onToggleCriticalPath}
          />
          <Text style={{ fontSize: 12.5 }}>Show critical path</Text>
        </Flex>
      </Flex>

      <IntelCallout />
    </Flex>
  </Surface>
);
