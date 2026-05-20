import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ZONE_COLOR,
  ZONE_DESCRIPTION,
  ZONE_LABEL,
  type Tool,
  type ToolZone,
} from "./useTools";

const ZONES: ToolZone[] = ["bottleneck", "hot-spot", "quiet", "healthy"];

const ZoneCard = ({
  zone,
  count,
  active,
  onClick,
}: {
  zone: ToolZone;
  count: number;
  active: boolean;
  onClick: () => void;
}) => {
  const color = ZONE_COLOR[zone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
      }}
    >
      <Surface
        elevation="raised"
        padding={12}
        style={{
          background: active
            ? `color-mix(in oklab, ${color} 14%, var(--surface))`
            : "var(--surface)",
          border: `1px solid ${active ? color : "var(--border)"}`,
          borderLeft: `4px solid ${color}`,
          height: "100%",
        }}
      >
        <Flex flexDirection="column" gap={4}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color,
            }}
          >
            {ZONE_LABEL[zone]}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {count}
          </Text>
          <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>
            {ZONE_DESCRIPTION[zone]}
          </Text>
        </Flex>
      </Surface>
    </button>
  );
};

export interface ToolHealthByZoneProps {
  tools: Tool[];
  isLoading: boolean;
  selectedZone: ToolZone | null;
  onSelect: (zone: ToolZone | null) => void;
}

export const ToolHealthByZone = ({
  tools,
  isLoading,
  selectedZone,
  onSelect,
}: ToolHealthByZoneProps) => {
  const counts = useMemo(() => {
    const c: Record<ToolZone, number> = {
      bottleneck: 0,
      "hot-spot": 0,
      quiet: 0,
      healthy: 0,
    };
    for (const t of tools) c[t.zone] += 1;
    return c;
  }, [tools]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Tool health by zone
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Click a zone to filter the scatter chart and table below
            </Text>
          </Flex>
          {selectedZone && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-label="Clear zone filter"
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--blue)",
              }}
            >
              Clear filter
            </button>
          )}
        </Flex>

        {isLoading && tools.length === 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 90, borderRadius: 10 }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {ZONES.map((zone) => (
              <ZoneCard
                key={zone}
                zone={zone}
                count={counts[zone]}
                active={selectedZone === zone}
                onClick={() => onSelect(selectedZone === zone ? null : zone)}
              />
            ))}
          </div>
        )}
      </Flex>
    </Surface>
  );
};
