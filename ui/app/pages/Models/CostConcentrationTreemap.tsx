import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent, fmtUSDCompact } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import type { ServiceCost } from "./useFinOps";
import { buildConcentrationSegments } from "./finopsLogic";
import { ServiceDetailModal } from "./ServiceDetailModal";

/**
 * 100%-stacked cost-concentration bar. The old slice-and-dice treemap always
 * gave the top service the left 50% of the canvas regardless of its real share,
 * so tile *area* was decoupled from spend — only the % text was truthful. Here
 * every segment's width equals its exact share of total spend, and colour keys
 * off the dominant model's provider so identity matches the rest of the page.
 */

export interface CostConcentrationTreemapProps {
  services: ServiceCost[];
  isLoading: boolean;
}

export const CostConcentrationTreemap = ({
  services,
  isLoading,
}: CostConcentrationTreemapProps) => {
  const segments = useMemo(
    () => buildConcentrationSegments(services, 8),
    [services],
  );
  const [selected, setSelected] = useState<ServiceCost | null>(null);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost concentration
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Share of fleet spend by service (current scope) · bar width = spend
            share · click a segment for detail
          </Text>
        </Flex>
        {isLoading && segments.length === 0 ? (
          <Skeleton style={{ height: 200, borderRadius: 8 }} />
        ) : segments.length === 0 ? (
          <EmptyState
            bare
            title="No priced spend in this scope"
            description="No service in scope has costable token usage in the current timeframe."
            hint="Models not in data/pricing.ts contribute no cost. Widen the timeframe or check that priced models are in use."
          />
        ) : (
          <Flex flexDirection="column" gap={12}>
            {/* 100%-stacked bar — width == exact spend share */}
            <div
              role="img"
              aria-label={`Cost concentration: ${segments
                .map((s) => `${s.label} ${fmtPercent(s.share, 0)}`)
                .join(", ")}`}
              style={{
                display: "flex",
                width: "100%",
                height: 44,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              {segments.map((seg) => {
                const interactive = seg.service != null;
                return (
                  <div
                    key={seg.label}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={
                      interactive
                        ? `Open details for ${seg.label}`
                        : undefined
                    }
                    onClick={
                      interactive
                        ? () => setSelected(seg.service)
                        : undefined
                    }
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(seg.service);
                            }
                          }
                        : undefined
                    }
                    title={`${seg.label}: ${fmtUSDCompact(seg.cost)} (${fmtPercent(seg.share, 0)})`}
                    style={{
                      width: `${seg.share}%`,
                      minWidth: 2,
                      height: "100%",
                      background: `color-mix(in oklab, ${seg.color} 55%, var(--surface))`,
                      borderRight: "1px solid var(--surface)",
                      cursor: interactive ? "pointer" : "default",
                    }}
                  />
                );
              })}
            </div>

            {/* Legend / ranked list */}
            <Flex flexDirection="column" gap={6}>
              {segments.map((seg) => {
                const interactive = seg.service != null;
                return (
                  <Flex
                    key={`legend-${seg.label}`}
                    alignItems="center"
                    gap={8}
                    role={interactive ? "button" : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onClick={
                      interactive ? () => setSelected(seg.service) : undefined
                    }
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(seg.service);
                            }
                          }
                        : undefined
                    }
                    style={{ cursor: interactive ? "pointer" : "default" }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: seg.color,
                        flex: "0 0 auto",
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 12,
                        color: "var(--text)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {seg.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                        flex: "0 0 auto",
                      }}
                    >
                      {fmtUSDCompact(seg.cost)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-3)",
                        fontVariantNumeric: "tabular-nums",
                        width: 44,
                        textAlign: "right",
                        flex: "0 0 auto",
                      }}
                    >
                      {fmtPercent(seg.share, 0)}
                    </Text>
                  </Flex>
                );
              })}
            </Flex>
          </Flex>
        )}
      </Flex>
      {selected && (
        <ServiceDetailModal
          service={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Surface>
  );
};
