import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtTokens } from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { useExplorerHeatmap } from "./useExplorerHeatmap";

const CELL_W = 64;
const CELL_H = 28;
const SVC_COL_W = 220;

const cellColor = (tokens: number, max: number, color: string): string => {
  if (tokens <= 0 || max <= 0) return "transparent";
  // log-scaled saturation, per DESIGN_HANDOFF §4.2
  const ratio = Math.log10(tokens + 1) / Math.log10(max + 1);
  const pct = Math.max(5, Math.min(90, Math.round(ratio * 90)));
  return `color-mix(in oklab, ${color} ${pct}%, transparent)`;
};

// Body is a separate component so useExplorerHeatmap (an independent DQL query)
// only runs while the section is expanded — collapsing unmounts the body and
// issues no query.
const ServiceModelHeatmapBody = () => {
  const result = useExplorerHeatmap();
  return (
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      <Flex alignItems="baseline" justifyContent="flex-end">
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {result.rows.length} services · {result.columns.length} models
        </Text>
      </Flex>

      {result.isLoading ? (
        <Skeleton style={{ height: 240 }} />
      ) : result.rows.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No usage data in the current scope.
        </Text>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div
            role="table"
            style={{
              display: "grid",
              gridTemplateColumns: `${SVC_COL_W}px repeat(${result.columns.length}, ${CELL_W}px)`,
              gap: 2,
              minWidth: SVC_COL_W + CELL_W * result.columns.length + 8,
            }}
          >
            <div
              style={{
                position: "sticky",
                left: 0,
                background: "var(--surface)",
                zIndex: 1,
                padding: "6px 8px",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Service
            </div>
            {result.columns.map((col) => (
              <div
                key={col.model}
                style={{
                  padding: "4px 4px",
                  textAlign: "center",
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 10.5,
                  color: "var(--text-3)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={col.model}
              >
                <Flex
                  alignItems="center"
                  justifyContent="center"
                  gap={4}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: col.color,
                      flex: "0 0 auto",
                    }}
                  />
                  <FilterTrigger
                    attribute="gen_ai.request.model"
                    value={col.rawModels.length > 0 ? col.rawModels : col.model}
                    label="model"
                  >
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: CELL_W - 16,
                      }}
                    >
                      {col.model}
                    </span>
                  </FilterTrigger>
                </Flex>
              </div>
            ))}

            {result.rows.slice(0, 30).map((row) => (
              <React.Fragment key={row.serviceId}>
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--surface)",
                    padding: "6px 8px",
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 12,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    borderTop: "1px solid var(--border)",
                  }}
                  title={row.service}
                >
                  <Flex alignItems="center" gap={6}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--green-2)",
                        flex: "0 0 auto",
                      }}
                    />
                    <FilterTrigger
                      attribute="service.name"
                      value={row.service}
                      label="service"
                    >
                      {row.service}
                    </FilterTrigger>
                  </Flex>
                </div>
                {result.columns.map((col) => {
                  const cell = row.cells.get(col.model);
                  const tokens = cell?.tokens ?? 0;
                  return (
                    <div
                      key={col.model}
                      title={
                        cell
                          ? `${row.service} · ${col.model}: ${fmtTokens(tokens)} tokens (${cell.requests} req)`
                          : `${row.service} · ${col.model}: 0`
                      }
                      style={{
                        height: CELL_H,
                        borderTop: "1px solid var(--border)",
                        background: cellColor(
                          tokens,
                          result.maxCellTokens,
                          col.color,
                        ),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 10.5,
                        color: "var(--text-2)",
                      }}
                    >
                      {tokens > 0 ? fmtTokens(tokens) : ""}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </Flex>
  );
};

export const ServiceModelHeatmap = () => (
  <CollapsibleCard
    title="Service × model usage"
    subtitle="Tokens per service / model — log-scaled cell color"
    defaultOpen
  >
    <ServiceModelHeatmapBody />
  </CollapsibleCard>
);
