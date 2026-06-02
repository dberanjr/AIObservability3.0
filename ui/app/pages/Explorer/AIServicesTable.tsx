import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronRightIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtPercent, fmtTokens } from "../../data/format";
import {
  PROVIDER_COLOR,
  normalizeProvider,
  canonicalizeModel,
} from "../../detection/attributes";
import { FilterTrigger } from "../../components/FilterTrigger";
import type { AIService } from "./useAIServices";

const COLS = [
  { id: "status", label: "", width: 24 },
  { id: "service", label: "Service" },
  { id: "framework", label: "Framework", width: 120 },
  { id: "models", label: "Models", width: 220 },
  { id: "req", label: "LLM req", width: 80, align: "right" as const },
  { id: "tokens", label: "Tokens", width: 90, align: "right" as const },
  { id: "tokPerReq", label: "Tok/req", width: 90, align: "right" as const },
  { id: "agents", label: "Agents", width: 70, align: "right" as const },
  { id: "errors", label: "Errors", width: 80, align: "right" as const },
  { id: "logical", label: "Logical err", width: 100, align: "right" as const },
  { id: "drill", label: "", width: 24 },
];

const HeaderCell = ({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
}) => (
  <div
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      textAlign: align,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--text-3)",
      padding: "8px 6px",
    }}
  >
    {children}
  </div>
);

const Cell = ({
  children,
  width,
  align,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      minWidth: 0,
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: "var(--text)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const ModelChips = ({
  models,
  rawModels,
}: {
  models: string[];
  rawModels: string[];
}) => (
  <Flex gap={4} style={{ flexWrap: "wrap" }}>
    {models.slice(0, 3).map((m) => {
      const provider = normalizeProvider(undefined, m);
      // Raw gen_ai.request.model values that canonicalize to this chip label.
      const variants = rawModels.filter(
        (raw) => canonicalizeModel(raw).label === m,
      );
      return (
        <FilterTrigger
          key={m}
          attribute="gen_ai.request.model"
          value={variants.length > 0 ? variants : m}
          label="model"
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid color-mix(in oklab, ${PROVIDER_COLOR[provider.id]} 40%, transparent)`,
              background: `color-mix(in oklab, ${PROVIDER_COLOR[provider.id]} 10%, transparent)`,
              fontFamily: "var(--mono, monospace)",
              fontSize: 11,
              color: "var(--text-2)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: PROVIDER_COLOR[provider.id],
              }}
            />
            {m}
          </span>
        </FilterTrigger>
      );
    })}
    {models.length > 3 && (
      <span
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          alignSelf: "center",
        }}
      >
        +{models.length - 3}
      </span>
    )}
  </Flex>
);

export interface AIServicesTableProps {
  rows: AIService[];
  isLoading: boolean;
  onRowClick?: (row: AIService) => void;
}

export const AIServicesTable = ({
  rows,
  isLoading,
  onRowClick,
}: AIServicesTableProps) => (
  <Surface elevation="raised" padding={0}>
    <Flex flexDirection="column" gap={0}>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
      >
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            AI services
          </Heading>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Any monitored service that emitted LLM spans
            (<code>gen_ai.provider.name</code>) in scope — classified
            automatically, no tagging required.
          </Text>
        </Flex>
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {rows.length} {rows.length === 1 ? "service" : "services"}
        </Text>
      </Flex>

      <div
        style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
      >
        {COLS.map((c) => (
          <HeaderCell key={c.id} width={c.width} align={c.align}>
            {c.label}
          </HeaderCell>
        ))}
      </div>

      {isLoading && rows.length === 0 ? (
        <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 36 }} />
          ))}
        </Flex>
      ) : rows.length === 0 ? (
        <Flex style={{ padding: "32px 16px" }}>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No AI services match the current filters.
          </Text>
        </Flex>
      ) : (
        <Flex flexDirection="column" gap={0}>
          {rows.map((r) => (
            <div
              key={r.serviceId}
              role="row"
              tabIndex={onRowClick ? 0 : -1}
              onClick={() => onRowClick?.(r)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onRowClick(r);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderTop: "1px solid var(--border)",
                cursor: onRowClick ? "pointer" : "default",
                background:
                  r.logicalErrors > 0
                    ? "color-mix(in oklab, var(--amber) 4%, transparent)"
                    : undefined,
              }}
            >
              <Cell width={24}>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      r.errorRatePct > 5
                        ? "var(--red)"
                        : r.errorRatePct > 1
                          ? "var(--amber)"
                          : "var(--green-2)",
                  }}
                />
              </Cell>
              <Cell
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12.5,
                }}
              >
                <FilterTrigger
                  attribute="service.name"
                  value={r.service}
                  label="service"
                >
                  {r.service}
                </FilterTrigger>
              </Cell>
              <Cell width={120}>
                {r.framework ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--surface-3)",
                      fontSize: 11,
                      color: "var(--text-2)",
                    }}
                  >
                    {r.framework}
                  </span>
                ) : (
                  <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
                )}
              </Cell>
              <Cell
                width={220}
                style={{ whiteSpace: "normal", overflow: "visible" }}
              >
                <ModelChips models={r.modelDisplay} rawModels={r.models} />
              </Cell>
              <Cell
                width={80}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.requests)}
              </Cell>
              <Cell
                width={90}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTokens(r.tokens)}
              </Cell>
              <Cell
                width={90}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTokens(Math.round(r.tokPerReq))}
              </Cell>
              <Cell
                width={70}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.agents)}
              </Cell>
              <Cell
                width={80}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                  color: r.errors > 0 ? "var(--amber)" : "var(--text)",
                }}
              >
                {r.errors > 0
                  ? `${fmtCount(r.errors)} (${fmtPercent(r.errorRatePct)})`
                  : "0"}
              </Cell>
              <Cell width={100} align="right">
                {r.logicalErrors > 0 ? (
                  <Flex
                    alignItems="center"
                    gap={4}
                    justifyContent="flex-end"
                    style={{ color: "var(--amber)" }}
                  >
                    <WarningIcon size={14} />
                    <Text
                      style={{
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 12.5,
                        color: "var(--amber)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtCount(r.logicalErrors)}
                    </Text>
                  </Flex>
                ) : (
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12.5,
                      color: "var(--text-4)",
                    }}
                  >
                    0
                  </Text>
                )}
              </Cell>
              <Cell width={24}>
                {onRowClick && (
                  <ChevronRightIcon
                    size={14}
                    style={{ color: "var(--text-3)" }}
                  />
                )}
              </Cell>
            </div>
          ))}
        </Flex>
      )}

      <Flex
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            lineHeight: 1.5,
          }}
        >
          Logical errors are HTTP 200 responses with payload-level failures.
          The load-bearing signal here is{" "}
          <code>gen_ai.response.finish_reasons</code> containing{" "}
          <code>max_tokens</code> (truncated output), <code>content_filter</code>,
          or <code>refusal</code>. OTel markers (<code>gen_ai.error.type</code>,
          guardrail/moderation events, <code>gen_ai.response.refusal_reason</code>)
          are also counted when present, but emit no data in this environment.
        </Text>
      </Flex>
    </Flex>
  </Surface>
);
