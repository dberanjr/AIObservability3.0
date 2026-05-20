import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../charts/Sparkline";
import { fmtPercent } from "../../data/format";
import type { DegradedTrendItem } from "./types";

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: `color-mix(in oklab, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
      color,
    }}
  >
    {label}
  </span>
);

const IntelCallout = ({ label }: { label: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: "var(--intel-soft)",
      color: "var(--purple)",
    }}
  >
    {label}
  </span>
);

export interface DegradedTrendPanelProps {
  items: DegradedTrendItem[];
  isLoading: boolean;
  /** Override the panel title (default: "Degraded performance detection"). */
  title?: string;
  /** Override the panel subtitle. */
  subtitle?: string;
  /** Header callout copy (default: "rolling 7d baseline"). */
  headerCallout?: string;
  /** Empty-state copy when no items qualify. */
  emptyMessage?: string;
}

export const DegradedTrendPanel = ({
  items,
  isLoading,
  title = "Degraded performance detection",
  subtitle = "Top entities running slow versus their rolling baseline",
  headerCallout = "rolling 7d baseline",
  emptyMessage = "No entities above the slow threshold in the current scope.",
}: DegradedTrendPanelProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="center" justifyContent="space-between">
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {subtitle}
          </Text>
        </Flex>
        <IntelCallout label={headerCallout} />
      </Flex>

      {isLoading && items.length === 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: 10 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Flex
          alignItems="center"
          justifyContent="center"
          style={{
            padding: "24px 16px",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            background: "var(--surface-2)",
          }}
        >
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            {emptyMessage}
          </Text>
        </Flex>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))`,
            gap: 10,
          }}
        >
          {items.map((item) => (
            <Surface key={item.id} elevation="raised" padding={12}>
              <Flex flexDirection="column" gap={6}>
                <Text
                  style={{
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 12,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name}
                </Text>
                <Flex alignItems="baseline" gap={6}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: item.isDegraded ? "var(--amber)" : "var(--text)",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {item.displayValue}
                  </Text>
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {item.metricLabel}
                  </Text>
                </Flex>
                {item.trend.length > 1 ? (
                  <Sparkline
                    values={item.trend}
                    color={
                      item.isBreached
                        ? "var(--red)"
                        : item.isDegraded
                          ? "var(--amber)"
                          : "var(--blue)"
                    }
                    height={26}
                  />
                ) : (
                  <div style={{ height: 26 }} />
                )}
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {item.pctVsBaseline >= 0
                    ? `+${fmtPercent(item.pctVsBaseline, 0)}`
                    : fmtPercent(item.pctVsBaseline, 0)}{" "}
                  vs baseline
                </Text>
                <Flex gap={4} style={{ flexWrap: "wrap" }}>
                  {item.isDegraded && (
                    <Badge label="Degraded" color="var(--amber)" />
                  )}
                  {item.isBreached && (
                    <Badge label="SLA breach" color="var(--red)" />
                  )}
                </Flex>
              </Flex>
            </Surface>
          ))}
        </div>
      )}
    </Flex>
  </Surface>
);
