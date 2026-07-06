import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@dynatrace/strato-icons";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
} from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import { BlendedBadge } from "../../components/displayHints";
import { useModelDisplay } from "../../components/useModelDisplay";
import { MODEL_TYPE_LABEL, type ModelRow } from "./useModels";
import { ModelDetailModal } from "./ModelDetailModal";

type SortKey =
  | "model"
  | "requests"
  | "inputTokens"
  | "outputTokens"
  | "avgMs"
  | "p95Ms"
  | "p99Ms"
  | "errorRatePct"
  | "timeoutRatePct"
  | "tokensPerSec"
  | "contextUtilizationPct"
  | "cost"
  | "costPerRequest"
  | "costPerMTok";

/** $ per LLM call — unit economics, derived from the row's total cost. */
const costPerCall = (m: ModelRow): number =>
  m.requests > 0 ? m.cost / m.requests : 0;

interface Column {
  id: string;
  label: string;
  width?: number;
  /** Flexible column that absorbs slack but never shrinks below minWidth. */
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
  sortBy?: SortKey;
}

/**
 * Single source of truth for a column's flex/width so the header and every data
 * cell lay out identically. Previously the header's flexible "Model" column had
 * minWidth:auto while its data cell had minWidth:0 — they collapsed to different
 * widths, knocking every downstream column out of alignment and squeezing the
 * model name to a single character. Driving both from this helper keeps them
 * pinned together; box-sizing makes the px widths exact regardless of theme.
 */
const colStyle = (c: Pick<Column, "width" | "grow" | "minWidth">): React.CSSProperties =>
  c.grow
    ? { flex: `1 1 ${c.minWidth ?? 200}px`, minWidth: c.minWidth ?? 200, boxSizing: "border-box" }
    : { flex: "0 0 auto", width: c.width, boxSizing: "border-box" };

/** Min width of the table body; below this the horizontal scroller kicks in so
 *  columns keep their widths and stay aligned instead of collapsing. */
const TABLE_MIN_WIDTH = 1540;

// FinOps focus: money sits right after the model/provider identity columns so
// $/call / Cost / $/1M are visible before the horizontal scroll reaches the
// latency percentiles.
const COLS: Column[] = [
  { id: "model", label: "Model", grow: true, minWidth: 200, sortBy: "model" },
  { id: "type", label: "Type", width: 100 },
  { id: "provider", label: "Provider", width: 130 },
  { id: "cost", label: "Cost", width: 90, align: "right", sortBy: "cost" },
  { id: "percall", label: "$/call", width: 90, align: "right", sortBy: "costPerRequest" },
  { id: "per1m", label: "$/1M", width: 90, align: "right", sortBy: "costPerMTok" },
  { id: "req", label: "Req", width: 80, align: "right", sortBy: "requests" },
  { id: "in", label: "In tok", width: 80, align: "right", sortBy: "inputTokens" },
  { id: "out", label: "Out tok", width: 80, align: "right", sortBy: "outputTokens" },
  { id: "ctx", label: "Ctx util", width: 110, sortBy: "contextUtilizationPct" },
  { id: "tps", label: "Tok/s", width: 80, align: "right", sortBy: "tokensPerSec" },
  { id: "avg", label: "Avg", width: 80, align: "right", sortBy: "avgMs" },
  { id: "p95", label: "P95", width: 80, align: "right", sortBy: "p95Ms" },
  { id: "p99", label: "P99", width: 80, align: "right", sortBy: "p99Ms" },
  { id: "err", label: "Err", width: 70, align: "right", sortBy: "errorRatePct" },
  { id: "timeout", label: "Timeout", width: 80, align: "right", sortBy: "timeoutRatePct" },
];

const ProviderChip = ({ model }: { model: ModelRow }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      border: `1px solid color-mix(in oklab, ${model.providerColor} 50%, transparent)`,
      background: "transparent",
      fontSize: 11,
      color: model.providerColor,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}
  >
    <span
      aria-hidden
      style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: model.providerColor,
      }}
    />
    {model.provider.label}
  </span>
);

const TypeChip = ({ model }: { model: ModelRow }) => (
  <span
    title={
      model.typeInferredFromName ? "Inferred from model name" : undefined
    }
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      background: "var(--surface-3)",
      fontSize: 11,
      color: "var(--text-2)",
    }}
  >
    {MODEL_TYPE_LABEL[model.type]}
    {model.typeInferredFromName && (
      <span style={{ marginLeft: 4, color: "var(--text-4)" }}>·</span>
    )}
  </span>
);

const ContextUtilBar = ({ model }: { model: ModelRow }) => {
  if (model.contextUtilizationPct == null) {
    return (
      <Text
        style={{
          fontSize: 11.5,
          color: "var(--text-4)",
          fontFamily: "var(--mono, monospace)",
        }}
      >
        —
      </Text>
    );
  }
  const pct = Math.min(100, Math.max(0, model.contextUtilizationPct));
  const color =
    pct < 40 ? "var(--green-2)" : pct < 80 ? "var(--amber)" : "var(--red)";
  return (
    <Flex flexDirection="column" gap={2} style={{ width: "100%" }}>
      <div
        style={{
          position: "relative",
          height: 6,
          width: "100%",
          background: "var(--surface-3)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: "100%",
            background: color,
          }}
        />
      </div>
      <Text
        style={{
          fontSize: 11,
          color: "var(--text-2)",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--mono, monospace)",
        }}
      >
        {fmtPercent(model.contextUtilizationPct, 0)}
      </Text>
    </Flex>
  );
};

const Cell = ({
  children,
  width,
  grow,
  minWidth,
  align,
  mono,
  color,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      ...colStyle({ width, grow, minWidth }),
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: color ?? "var(--text)",
      fontFamily: mono ? "var(--mono, monospace)" : undefined,
      fontVariantNumeric: mono ? "tabular-nums" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const costColor = (perMTok: number): string | undefined => {
  if (perMTok > 0 && perMTok < 2) return "var(--green-2)";
  if (perMTok > 20) return "var(--red)";
  return undefined;
};

export interface ModelsTableProps {
  models: ModelRow[];
  isLoading: boolean;
}

export const ModelsTable = ({ models, isLoading }: ModelsTableProps) => {
  const fmtModel = useModelDisplay();
  const [selected, setSelected] = useState<ModelRow | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "requests",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const copy = [...models];
    copy.sort((a, b) => {
      const k = sort.key;
      if (k === "model") {
        const cmp = a.model.localeCompare(b.model);
        return sort.dir === "asc" ? cmp : -cmp;
      }
      if (k === "costPerRequest") {
        const cmp = costPerCall(a) - costPerCall(b);
        return sort.dir === "asc" ? cmp : -cmp;
      }
      const av = (a[k] as number | null | undefined) ?? 0;
      const bv = (b[k] as number | null | undefined) ?? 0;
      const cmp = av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [models, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );

  // The Timeout column reads span.status_code == "TIMEOUT". Most tenants never
  // emit it (this fleet sets span.status_code only for "error", never
  // "TIMEOUT"), so the column would be an all-"—"/"0%" filler that pads the row
  // and pushes Cost / $/1M off to the right. Only show it when a model actually
  // recorded a timeout, so it carries real signal when present and disappears
  // otherwise.
  const showTimeout = useMemo(
    () => models.some((m) => m.timeouts > 0),
    [models],
  );
  const cols = useMemo(
    () => (showTimeout ? COLS : COLS.filter((c) => c.id !== "timeout")),
    [showTimeout],
  );
  const tableMinWidth = showTimeout ? TABLE_MIN_WIDTH : TABLE_MIN_WIDTH - 80;

  return (
    <div style={{ overflowX: "auto" }}>
      <style>{`.models-row{cursor:pointer}.models-row:hover{background:var(--surface-2)}`}</style>
      <Flex flexDirection="column" gap={0} style={{ minWidth: tableMinWidth }}>
        <Flex
          alignItems="center"
          style={{ padding: "0 10px", borderBottom: "1px solid var(--border)" }}
        >
          {cols.map((c) => {
            const active = c.sortBy && sort.key === c.sortBy;
            const Arrow =
              active && sort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!c.sortBy}
                onClick={() => c.sortBy && toggleSort(c.sortBy)}
                style={{
                  all: "unset",
                  ...colStyle(c),
                  cursor: c.sortBy ? "pointer" : "default",
                  textAlign: c.align,
                  padding: "8px 6px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: active ? "var(--text)" : "var(--text-3)",
                }}
              >
                <Flex
                  alignItems="center"
                  justifyContent={
                    c.align === "right" ? "flex-end" : "flex-start"
                  }
                  gap={2}
                >
                  {c.label}
                  {active && <Arrow size={12} />}
                </Flex>
              </button>
            );
          })}
        </Flex>

        {isLoading && sorted.length === 0 ? (
          <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 36 }} />
            ))}
          </Flex>
        ) : sorted.length === 0 ? (
          <Flex style={{ padding: "32px 16px" }}>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No models match the current filter.
            </Text>
          </Flex>
        ) : (
          sorted.map((m) => (
            <div
              key={m.modelKey}
              role="button"
              tabIndex={0}
              aria-label={`Open details for ${m.model}`}
              className="models-row"
              onClick={() => setSelected(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(m);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <Cell mono grow minWidth={200}>
                {/* Stop propagation so the model-name click filters (existing
                    behavior) without also opening the row detail modal. */}
                <span onClick={(e) => e.stopPropagation()}>
                  <FilterTrigger
                    attribute="gen_ai.request.model"
                    value={m.rawModels}
                    label="model"
                  >
                    {fmtModel(m.rawModels?.[0] ?? m.model)}
                  </FilterTrigger>
                </span>
              </Cell>
              <Cell width={100}>
                <TypeChip model={m} />
              </Cell>
              <Cell width={130}>
                <ProviderChip model={m} />
              </Cell>
              <Cell width={90} align="right" mono>
                {fmtUSD(m.cost)}
                {m.pricingUnknown && <BlendedBadge />}
              </Cell>
              <Cell width={90} align="right" mono>
                {fmtUSD(costPerCall(m))}
                {m.pricingUnknown && <BlendedBadge />}
              </Cell>
              <Cell
                width={90}
                align="right"
                mono
                color={m.pricingUnknown ? undefined : costColor(m.costPerMTok)}
              >
                {fmtUSD(m.costPerMTok)}
                {m.pricingUnknown && <BlendedBadge />}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtCount(m.requests)}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtTokens(m.inputTokens)}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtTokens(m.outputTokens)}
              </Cell>
              <Cell width={110}>
                <ContextUtilBar model={m} />
              </Cell>
              <Cell width={80} align="right" mono>
                {m.tokensPerSec == null ? (
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-4)",
                      fontFamily: "var(--mono, monospace)",
                    }}
                  >
                    —
                  </Text>
                ) : (
                  Math.round(m.tokensPerSec).toLocaleString()
                )}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtMs(m.avgMs)}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtMs(m.p95Ms)}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtMs(m.p99Ms)}
              </Cell>
              <Cell
                width={70}
                align="right"
                mono
                color={m.errorRatePct > 5 ? "var(--red)" : undefined}
              >
                {m.errors > 0 ? fmtPercent(m.errorRatePct) : "0%"}
              </Cell>
              {showTimeout && (
                <Cell width={80} align="right" mono>
                  {m.hasTimeoutAttribute ? (
                    m.timeouts > 0 ? (
                      fmtPercent(m.timeoutRatePct, 2)
                    ) : (
                      "0%"
                    )
                  ) : (
                    <Text
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-4)",
                        fontFamily: "var(--mono, monospace)",
                      }}
                      title="span.status_code not set on this model's spans"
                    >
                      —
                    </Text>
                  )}
                </Cell>
              )}
            </div>
          ))
        )}

        <Flex
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            Click a row for full cost, pricing and golden-signal detail. $/1M
            coloured green &lt; $2, red &gt; $20. Context util = avg input tokens
            / model context window from <code>data/pricing.ts</code> (green &lt;
            40%, amber 40–80%, red &gt; 80%). Tokens/sec shows "—" for embedding
            models.
          </Text>
        </Flex>
      </Flex>
      {selected && (
        <ModelDetailModal
          model={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};
