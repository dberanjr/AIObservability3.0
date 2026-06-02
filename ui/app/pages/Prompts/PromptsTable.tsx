import React, { useMemo, useState, useRef, useEffect } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  RefreshIcon,
  SettingIcon,
} from "@dynatrace/strato-icons";
import { fmtMs, fmtTokens } from "../../data/format";
import { getPricing, estimateCost } from "../../data/pricing";
import type { PromptRow } from "./usePrompts";
import type { PrivacyMode } from "./PromptsSidebar";
import { maskPII } from "./privacy";
import { usePersistedState } from "../../state/usePersistedState";
import { PromptDetailPanel } from "./PromptDetailPanel";

export type PromptView = "stream" | "metadata" | "evaluations";
// Every column except Time is optional. Time is always shown as the anchor.
type VisibleColumn =
  | "service"
  | "model"
  | "type"
  | "temperature"
  | "duration"
  | "in_tok"
  | "out_tok"
  | "in_cost"
  | "out_cost"
  | "input"
  | "output"
  | "trace_id"
  | "system_prompt";
type SortKey =
  | "timestampMs"
  | "inTokens"
  | "outTokens"
  | "durationMs"
  | "temperature"
  | "inCost"
  | "outCost";
type SortDir = "asc" | "desc";

const VIEW_OPTIONS: { value: PromptView; label: string }[] = [
  { value: "stream", label: "Stream" },
  { value: "metadata", label: "Metadata" },
  { value: "evaluations", label: "Evaluations" },
];

// Toggleable columns per view (Time is always shown and not listed here).
const STREAM_COLUMNS: { key: VisibleColumn; label: string }[] = [
  { key: "service", label: "AI app" },
  { key: "model", label: "Model" },
  { key: "in_tok", label: "In tokens" },
  { key: "out_tok", label: "Out tokens" },
  { key: "temperature", label: "Temperature" },
  { key: "duration", label: "Duration" },
  { key: "in_cost", label: "In cost" },
  { key: "out_cost", label: "Out cost" },
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "system_prompt", label: "System prompt" },
];
const METADATA_COLUMNS: { key: VisibleColumn; label: string }[] = [
  { key: "service", label: "AI app" },
  { key: "model", label: "Model" },
  { key: "type", label: "Type" },
  { key: "temperature", label: "Temperature" },
  { key: "duration", label: "Duration" },
  { key: "in_tok", label: "In tokens" },
  { key: "out_tok", label: "Out tokens" },
  { key: "in_cost", label: "In cost" },
  { key: "out_cost", label: "Out cost" },
  { key: "trace_id", label: "Trace ID" },
  { key: "system_prompt", label: "System prompt" },
];
const ALL_COLUMNS: VisibleColumn[] = [
  "service",
  "model",
  "type",
  "temperature",
  "duration",
  "in_tok",
  "out_tok",
  "in_cost",
  "out_cost",
  "input",
  "output",
  "trace_id",
  "system_prompt",
];
// Everything on by default except the verbose System prompt.
const DEFAULT_VISIBLE: VisibleColumn[] = ALL_COLUMNS.filter(
  (c) => c !== "system_prompt",
);

const TimeCell = ({ ms }: { ms: number }) => {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 11.5,
        color: "var(--text-3)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {datePart} {hh}:{mm}:{ss}
    </Text>
  );
};

const KindChip = ({ kind }: { kind: PromptRow["kind"] }) => {
  const color = kind === "LLM" ? "var(--blue)" : "var(--purple)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        color,
      }}
    >
      {kind}
    </span>
  );
};

const TypeChip = ({ label }: { label: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      background: "var(--surface-3)",
      fontSize: 11,
      color: "var(--text-2)",
    }}
  >
    {label}
  </span>
);

// Error rows get a noticeable red gradient (strong on the left, fading right)
// plus a solid red left border — clearly distinct from the subtle selected tint.
const ERROR_ROW_BG =
  "linear-gradient(90deg, color-mix(in oklab, var(--red) 22%, transparent), color-mix(in oklab, var(--red) 5%, transparent))";

// Temperature color band: cold (deterministic) → hot (creative).
const tempColor = (t: number): string => {
  if (t <= 0.3) return "var(--blue)";
  if (t <= 0.6) return "var(--green-2)";
  if (t <= 0.85) return "var(--amber)";
  return "var(--red)";
};

/**
 * Compact temperature pill — a small color-banded chip showing the value
 * (0–1+). Tinted background + matching text/border keep it readable while
 * occupying minimal width. Empty (no temperature emitted) renders as "—".
 */
const TempCell = ({ t }: { t: number | null }) => {
  if (t == null) {
    return <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>;
  }
  const c = tempColor(t);
  return (
    <span
      title={`temperature ${t}`}
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        color: c,
        background: `color-mix(in oklab, ${c} 16%, transparent)`,
        border: `1px solid color-mix(in oklab, ${c} 35%, transparent)`,
      }}
    >
      {t.toFixed(2)}
    </span>
  );
};

const Cell = ({
  children,
  width,
  align,
  mono,
  color,
  style,
  title,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  style?: React.CSSProperties;
  title?: string;
}) => (
  <div
    title={title}
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      minWidth: 0,
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

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

const HeaderCell = ({
  children,
  width,
  align,
  sortBy,
  activeSort,
  onSort,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  sortBy?: SortKey;
  activeSort?: { key: SortKey; dir: SortDir };
  onSort?: (key: SortKey) => void;
}) => {
  const isActive = sortBy && activeSort?.key === sortBy;
  const Arrow = isActive && activeSort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
  const baseStyle: React.CSSProperties = {
    flex: width ? "0 0 auto" : 1,
    width,
    // Match the data Cell: without minWidth:0 a flex item's default
    // min-width:auto lets a long header label grow the cell past its set
    // width, and the overage accumulates across columns — misaligning headers
    // from their data. Clip with ellipsis instead.
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: align,
    padding: "8px 6px",
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: isActive ? "var(--text)" : "var(--text-3)",
  };
  if (!sortBy || !onSort) {
    return <div style={baseStyle}>{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onSort(sortBy)}
      style={{ all: "unset", cursor: "pointer", ...baseStyle }}
    >
      <Flex
        alignItems="center"
        justifyContent={align === "right" ? "flex-end" : "flex-start"}
        gap={2}
      >
        {children}
        {isActive && <Arrow size={12} />}
      </Flex>
    </button>
  );
};

const ViewSegmented = ({
  value,
  onChange,
}: {
  value: PromptView;
  onChange: (next: PromptView) => void;
}) => (
  <div
    role="radiogroup"
    aria-label="View"
    style={{
      display: "inline-flex",
      padding: 2,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 999,
    }}
  >
    {VIEW_OPTIONS.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.value)}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: active ? 600 : 500,
            color: active ? "var(--text)" : "var(--text-2)",
            background: active ? "var(--surface)" : "transparent",
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const ColumnSelector = ({
  visibleCols,
  onToggle,
  columns,
}: {
  visibleCols: Set<VisibleColumn>;
  onToggle: (col: VisibleColumn) => void;
  columns: { key: VisibleColumn; label: string }[];
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 4,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          fontSize: 12,
          color: "var(--text-2)",
        }}
        title="Toggle columns"
      >
        <SettingIcon size={14} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: 8,
            zIndex: 1000,
            minWidth: 160,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
          }}
        >
          <Text
            style={{
              display: "block",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              padding: "2px 8px 6px",
            }}
          >
            Columns
          </Text>
          {columns.map((col) => (
            <label
              key={col.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              <input
                type="checkbox"
                checked={visibleCols.has(col.key)}
                onChange={() => onToggle(col.key)}
                style={{ cursor: "pointer" }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const StreamHeader = ({
  sort,
  onSort,
  visibleCols,
}: {
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  visibleCols: Set<VisibleColumn>;
}) => (
  <Flex
    alignItems="center"
    style={{ padding: "0 10px", borderLeft: "3px solid transparent" }}
  >
    <HeaderCell width={132} sortBy="timestampMs" activeSort={sort} onSort={onSort}>
      Time
    </HeaderCell>
    {visibleCols.has("service") && <HeaderCell width={140}>AI app</HeaderCell>}
    {visibleCols.has("model") && <HeaderCell width={160}>Model</HeaderCell>}
    {visibleCols.has("in_tok") && (
      <HeaderCell width={70} align="right" sortBy="inTokens" activeSort={sort} onSort={onSort}>
        In tok
      </HeaderCell>
    )}
    {visibleCols.has("out_tok") && (
      <HeaderCell width={70} align="right" sortBy="outTokens" activeSort={sort} onSort={onSort}>
        Out tok
      </HeaderCell>
    )}
    {visibleCols.has("temperature") && (
      <HeaderCell width={64} align="right" sortBy="temperature" activeSort={sort} onSort={onSort}>
        Temp
      </HeaderCell>
    )}
    {visibleCols.has("duration") && (
      <HeaderCell width={90} align="right" sortBy="durationMs" activeSort={sort} onSort={onSort}>
        Duration
      </HeaderCell>
    )}
    {visibleCols.has("in_cost") && (
      <HeaderCell width={70} align="right" sortBy="inCost" activeSort={sort} onSort={onSort}>
        In cost
      </HeaderCell>
    )}
    {visibleCols.has("out_cost") && (
      <HeaderCell width={70} align="right" sortBy="outCost" activeSort={sort} onSort={onSort}>
        Out cost
      </HeaderCell>
    )}
    {visibleCols.has("input") && <HeaderCell>Input</HeaderCell>}
    {visibleCols.has("output") && <HeaderCell>Output</HeaderCell>}
    {visibleCols.has("system_prompt") && <HeaderCell width={140}>System prompt</HeaderCell>}
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const fmtUSD = (cents: number): string => {
  if (!Number.isFinite(cents) || cents <= 0) return "—";
  const dollars = cents / 100;
  return `$${dollars.toFixed(5)}`;
};

// ---- Anomaly highlighting -------------------------------------------------
// Flag unusually HIGH duration / token / cost values relative to the rows on
// screen, so the user is visually cued to slow or expensive calls. Thresholds
// are percentile-based (p90 → amber "elevated", p98 → red "outlier") and only
// kick in once there are enough samples to be meaningful.
interface Thr {
  p90: number;
  p98: number;
}
export interface AnomalyStats {
  duration: Thr | null;
  inTok: Thr | null;
  outTok: Thr | null;
  inCost: Thr | null;
  outCost: Thr | null;
}
export const EMPTY_ANOMALY: AnomalyStats = {
  duration: null,
  inTok: null,
  outTok: null,
  inCost: null,
  outCost: null,
};

const percentileAsc = (sorted: number[], p: number): number =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const thresholdsFor = (values: number[]): Thr | null => {
  const v = values.filter((n) => n > 0).sort((a, b) => a - b);
  if (v.length < 5) return null; // too few samples to call anything anomalous
  return { p90: percentileAsc(v, 90), p98: percentileAsc(v, 98) };
};

/** Color for a value given its column thresholds: red outlier, amber elevated. */
const anomalyColor = (value: number, t: Thr | null): string | undefined => {
  if (!t || value <= 0) return undefined;
  if (value >= t.p98) return "var(--red)";
  if (value >= t.p90) return "var(--amber)";
  return undefined;
};

/** Build per-column thresholds from the displayed rows. */
export const computeAnomalyStats = (rows: PromptRow[]): AnomalyStats => ({
  duration: thresholdsFor(rows.map((r) => r.durationMs)),
  inTok: thresholdsFor(rows.map((r) => r.inTokens)),
  outTok: thresholdsFor(rows.map((r) => r.outTokens)),
  inCost: thresholdsFor(
    rows.map((r) =>
      r.inTokens > 0 ? estimateCost(r.inTokens, 0, getPricing(r.model)) : 0,
    ),
  ),
  outCost: thresholdsFor(
    rows.map((r) =>
      r.outTokens > 0 ? estimateCost(0, r.outTokens, getPricing(r.model)) : 0,
    ),
  ),
});

const StreamRow = ({
  prompt,
  privacy,
  onClick,
  isSelected,
  visibleCols,
  stats,
}: {
  prompt: PromptRow;
  privacy: PrivacyMode;
  onClick: (p: PromptRow) => void;
  isSelected: boolean;
  visibleCols: Set<VisibleColumn>;
  stats: AnomalyStats;
}) => {
  const inputText = privacy === "mask" ? maskPII(prompt.promptText) : prompt.promptText;
  const outputText =
    privacy === "mask" ? maskPII(prompt.responseText) : prompt.responseText;

  const pricing = getPricing(prompt.model);
  const inCost = prompt.inTokens > 0 ? estimateCost(prompt.inTokens, 0, pricing) : 0;
  const outCost = prompt.outTokens > 0 ? estimateCost(0, prompt.outTokens, pricing) : 0;

  const inTokColor = anomalyColor(prompt.inTokens, stats.inTok);
  const outTokColor = anomalyColor(prompt.outTokens, stats.outTok);
  const durColor = anomalyColor(prompt.durationMs, stats.duration);
  const inCostColor = anomalyColor(inCost, stats.inCost);
  const outCostColor = anomalyColor(outCost, stats.outCost);
  const bold = (c?: string) => (c ? { fontWeight: 600 } : undefined);

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onClick(prompt)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(prompt);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        borderTop: "1px solid var(--border)",
        borderLeft: isSelected
          ? "3px solid var(--blue)"
          : prompt.hasError
            ? "3px solid var(--red)"
            : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : prompt.hasError
            ? ERROR_ROW_BG
            : undefined,
      }}
    >
      <Cell width={132}>
        <TimeCell ms={prompt.timestampMs} />
      </Cell>
      {visibleCols.has("service") && (
        <Cell width={140} mono color="var(--text-2)">
          {prompt.service}
        </Cell>
      )}
      {visibleCols.has("model") && (
        <Cell width={160} mono color="var(--text-2)">
          {prompt.model ?? "—"}
        </Cell>
      )}
      {visibleCols.has("in_tok") && (
        <Cell width={70} align="right" mono color={inTokColor} style={bold(inTokColor)} title={inTokColor ? "Elevated input tokens" : undefined}>
          {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
        </Cell>
      )}
      {visibleCols.has("out_tok") && (
        <Cell width={70} align="right" mono color={outTokColor} style={bold(outTokColor)} title={outTokColor ? "Elevated output tokens" : undefined}>
          {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
        </Cell>
      )}
      {visibleCols.has("temperature") && (
        <Cell width={64} align="right">
          <TempCell t={prompt.temperature} />
        </Cell>
      )}
      {visibleCols.has("duration") && (
        <Cell width={90} align="right" mono color={durColor} style={bold(durColor)} title={durColor ? "Elevated duration" : undefined}>
          {prompt.durationMs > 0 ? fmtMs(prompt.durationMs) : "—"}
        </Cell>
      )}
      {visibleCols.has("in_cost") && (
        <Cell width={70} align="right" mono color={inCostColor} style={bold(inCostColor)} title={inCostColor ? "Elevated input cost" : undefined}>
          {fmtUSD(inCost)}
        </Cell>
      )}
      {visibleCols.has("out_cost") && (
        <Cell width={70} align="right" mono color={outCostColor} style={bold(outCostColor)} title={outCostColor ? "Elevated output cost" : undefined}>
          {fmtUSD(outCost)}
        </Cell>
      )}
      {visibleCols.has("input") && (
        <Cell title={inputText}>
          {inputText ? truncate(inputText, 80) : (
            <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
          )}
        </Cell>
      )}
      {visibleCols.has("output") && (
        <Cell title={outputText}>
          {outputText ? truncate(outputText, 80) : (
            <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
          )}
        </Cell>
      )}
      {visibleCols.has("system_prompt") && (
        <Cell width={140} title={prompt.systemPrompt ?? undefined}>
          {prompt.systemPrompt ? truncate(prompt.systemPrompt, 40) : (
            <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
          )}
        </Cell>
      )}
      <Cell width={24}>
        <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
      </Cell>
    </div>
  );
};

const MetadataHeader = ({
  sort,
  onSort,
  visibleCols,
}: {
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  visibleCols: Set<VisibleColumn>;
}) => (
  <Flex
    alignItems="center"
    style={{ padding: "0 10px", borderLeft: "3px solid transparent" }}
  >
    <HeaderCell width={132} sortBy="timestampMs" activeSort={sort} onSort={onSort}>
      Time
    </HeaderCell>
    {visibleCols.has("service") && <HeaderCell width={140}>AI app</HeaderCell>}
    {visibleCols.has("model") && <HeaderCell width={160}>Model</HeaderCell>}
    {visibleCols.has("type") && <HeaderCell width={110}>Type</HeaderCell>}
    {visibleCols.has("temperature") && (
      <HeaderCell width={64} align="right" sortBy="temperature" activeSort={sort} onSort={onSort}>
        Temp
      </HeaderCell>
    )}
    {visibleCols.has("duration") && (
      <HeaderCell width={90} align="right" sortBy="durationMs" activeSort={sort} onSort={onSort}>
        Duration
      </HeaderCell>
    )}
    {visibleCols.has("in_tok") && (
      <HeaderCell width={70} align="right" sortBy="inTokens" activeSort={sort} onSort={onSort}>
        In tok
      </HeaderCell>
    )}
    {visibleCols.has("out_tok") && (
      <HeaderCell width={70} align="right" sortBy="outTokens" activeSort={sort} onSort={onSort}>
        Out tok
      </HeaderCell>
    )}
    {visibleCols.has("in_cost") && (
      <HeaderCell width={70} align="right" sortBy="inCost" activeSort={sort} onSort={onSort}>
        In cost
      </HeaderCell>
    )}
    {visibleCols.has("out_cost") && (
      <HeaderCell width={70} align="right" sortBy="outCost" activeSort={sort} onSort={onSort}>
        Out cost
      </HeaderCell>
    )}
    {visibleCols.has("trace_id") && <HeaderCell>Trace ID</HeaderCell>}
    {visibleCols.has("system_prompt") && <HeaderCell width={140}>System prompt</HeaderCell>}
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const MetadataRow = ({
  prompt,
  onClick,
  isSelected,
  visibleCols,
  stats,
}: {
  prompt: PromptRow;
  onClick: (p: PromptRow) => void;
  isSelected: boolean;
  visibleCols: Set<VisibleColumn>;
  stats: AnomalyStats;
}) => {
  const pricing = getPricing(prompt.model);
  const inCost = prompt.inTokens > 0 ? estimateCost(prompt.inTokens, 0, pricing) : 0;
  const outCost = prompt.outTokens > 0 ? estimateCost(0, prompt.outTokens, pricing) : 0;

  const inTokColor = anomalyColor(prompt.inTokens, stats.inTok);
  const outTokColor = anomalyColor(prompt.outTokens, stats.outTok);
  const durColor = anomalyColor(prompt.durationMs, stats.duration);
  const inCostColor = anomalyColor(inCost, stats.inCost);
  const outCostColor = anomalyColor(outCost, stats.outCost);
  const bold = (c?: string) => (c ? { fontWeight: 600 } : undefined);

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onClick(prompt)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(prompt);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        borderTop: "1px solid var(--border)",
        borderLeft: isSelected
          ? "3px solid var(--blue)"
          : prompt.hasError
            ? "3px solid var(--red)"
            : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : prompt.hasError
            ? ERROR_ROW_BG
            : undefined,
      }}
    >
      <Cell width={132}>
        <TimeCell ms={prompt.timestampMs} />
      </Cell>
      {visibleCols.has("service") && (
        <Cell width={140} mono color="var(--text-2)">
          {prompt.service}
        </Cell>
      )}
      {visibleCols.has("model") && (
        <Cell width={160} mono color="var(--text-2)">
          {prompt.model ?? "—"}
        </Cell>
      )}
      {visibleCols.has("type") && (
        <Cell width={110}>
          <Flex gap={4}>
            <KindChip kind={prompt.kind} />
            <TypeChip label={prompt.typeLabel} />
          </Flex>
        </Cell>
      )}
      {visibleCols.has("temperature") && (
        <Cell width={64} align="right">
          <TempCell t={prompt.temperature} />
        </Cell>
      )}
      {visibleCols.has("duration") && (
        <Cell width={90} align="right" mono color={durColor} style={bold(durColor)} title={durColor ? "Elevated duration" : undefined}>
          {prompt.durationMs > 0 ? fmtMs(prompt.durationMs) : "—"}
        </Cell>
      )}
      {visibleCols.has("in_tok") && (
        <Cell width={70} align="right" mono color={inTokColor} style={bold(inTokColor)} title={inTokColor ? "Elevated input tokens" : undefined}>
          {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
        </Cell>
      )}
      {visibleCols.has("out_tok") && (
        <Cell width={70} align="right" mono color={outTokColor} style={bold(outTokColor)} title={outTokColor ? "Elevated output tokens" : undefined}>
          {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
        </Cell>
      )}
      {visibleCols.has("in_cost") && (
        <Cell width={70} align="right" mono color={inCostColor} style={bold(inCostColor)} title={inCostColor ? "Elevated input cost" : undefined}>
          {fmtUSD(inCost)}
        </Cell>
      )}
      {visibleCols.has("out_cost") && (
        <Cell width={70} align="right" mono color={outCostColor} style={bold(outCostColor)} title={outCostColor ? "Elevated output cost" : undefined}>
          {fmtUSD(outCost)}
        </Cell>
      )}
      {visibleCols.has("trace_id") && (
        <Cell mono color="var(--text-2)">
          {prompt.traceId ?? "—"}
        </Cell>
      )}
      {visibleCols.has("system_prompt") && (
        <Cell width={140} title={prompt.systemPrompt ?? undefined}>
          {prompt.systemPrompt ? truncate(prompt.systemPrompt, 40) : (
            <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
          )}
        </Cell>
      )}
      <Cell width={24}>
        <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
      </Cell>
    </div>
  );
};

const EvaluationsEmptyState = () => (
  <Flex
    flexDirection="column"
    gap={12}
    alignItems="center"
    style={{
      padding: "40px 24px",
      textAlign: "center",
    }}
  >
    <Heading level={3} style={{ fontSize: 16 }}>
      No evaluations attached yet
    </Heading>
    <Text style={{ fontSize: 12.5, color: "var(--text-2)", maxWidth: 520 }}>
      Three paths to populate this view:
    </Text>
    <Flex flexDirection="column" gap={6} style={{ maxWidth: 520, textAlign: "left" }}>
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        <strong>1. Add eval attrs to LLM spans.</strong> Set{" "}
        <code>gen_ai.evaluation.hallucination</code>,{" "}
        <code>gen_ai.evaluation.correctness</code>,{" "}
        <code>gen_ai.evaluation.faithfulness</code>, or{" "}
        <code>gen_ai.evaluation.relevance</code> on the producing span.
      </Text>
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        <strong>2. Run a Workflow LLM-as-judge.</strong> Schedule a workflow that scores
        sampled prompts and writes spans tagged with the same attribute keys.
      </Text>
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        <strong>3. Push offline eval results as business events.</strong> Emit a{" "}
        <code>gen_ai.evaluation</code> bizevent per sampled trace from your batch
        evaluation pipeline.
      </Text>
    </Flex>
  </Flex>
);

export interface PromptsTableProps {
  view: PromptView;
  onViewChange: (v: PromptView) => void;
  prompts: PromptRow[];
  isLoading: boolean;
  privacy: PrivacyMode;
  onRefresh: () => void;
}

export const PromptsTable = ({
  view,
  onViewChange,
  prompts,
  isLoading,
  privacy,
  onRefresh,
}: PromptsTableProps) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "timestampMs",
    dir: "desc",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState("");
  // v3 key: every column except Time is now individually toggleable, so the
  // stored value is the full set of shown columns (not just the extra ones).
  const [visibleColsArray, setVisibleColsArray] = usePersistedState<VisibleColumn[]>(
    "ai-obs.prompts-visible-cols.v3",
    DEFAULT_VISIBLE,
  );
  const validVisibleColsArray: VisibleColumn[] = Array.isArray(visibleColsArray)
    ? visibleColsArray
    : DEFAULT_VISIBLE;
  const visibleCols = new Set(validVisibleColsArray);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );

  const toggleColumn = (col: VisibleColumn) => {
    const next = new Set(validVisibleColsArray);
    if (next.has(col)) {
      next.delete(col);
    } else {
      next.add(col);
    }
    setVisibleColsArray(Array.from(next));
  };

  const searchLower = localSearch.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchLower) return prompts;
    return prompts.filter((p) => {
      const hay = `${p.promptText} ${p.responseText} ${p.service} ${p.model ?? ""} ${p.agent ?? ""}`.toLowerCase();
      return hay.includes(searchLower);
    });
  }, [prompts, searchLower]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      const cmp = av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  // Anomaly thresholds derived from the rows currently in view.
  const anomalyStats = useMemo(() => computeAnomalyStats(filtered), [filtered]);

  const selectedPrompt = useMemo(
    () => sorted.find((p) => p.id === selectedId) ?? null,
    [sorted, selectedId],
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedId]);

  return (
    <Surface elevation="raised" padding={0}>
      <Flex flexDirection="column" gap={0}>
        <Flex
          alignItems="center"
          justifyContent="space-between"
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Prompts
          </Heading>
          <Flex alignItems="center" gap={12}>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {sorted.length} shown
            </Text>
            <ViewSegmented value={view} onChange={onViewChange} />
          </Flex>
        </Flex>

        {view === "evaluations" ? (
          <EvaluationsEmptyState />
        ) : (
          <>
            <Flex
              alignItems="center"
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid var(--border)",
                gap: 12,
              }}
            >
              <input
                type="text"
                placeholder="Search prompts..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={onRefresh}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: "var(--text-2)",
                }}
                title="Refresh data"
              >
                <RefreshIcon size={14} />
              </button>
              <ColumnSelector
                visibleCols={visibleCols}
                onToggle={toggleColumn}
                columns={view === "stream" ? STREAM_COLUMNS : METADATA_COLUMNS}
              />
            </Flex>

            {view === "stream" ? (
              <StreamHeader sort={sort} onSort={toggleSort} visibleCols={visibleCols} />
            ) : (
              <MetadataHeader sort={sort} onSort={toggleSort} visibleCols={visibleCols} />
            )}
            {isLoading && sorted.length === 0 ? (
              <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} style={{ height: 36 }} />
                ))}
              </Flex>
            ) : sorted.length === 0 ? (
              <Flex style={{ padding: "32px 16px" }}>
                <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                  {localSearch
                    ? "No prompts match the search."
                    : "No prompts match the current filters."}
                </Text>
              </Flex>
            ) : (
              sorted.map((p) => (
                <React.Fragment key={p.id}>
                  {view === "stream" ? (
                    <StreamRow
                      prompt={p}
                      privacy={privacy}
                      onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                      isSelected={p.id === selectedId}
                      visibleCols={visibleCols}
                      stats={anomalyStats}
                    />
                  ) : (
                    <MetadataRow
                      prompt={p}
                      onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                      isSelected={p.id === selectedId}
                      visibleCols={visibleCols}
                      stats={anomalyStats}
                    />
                  )}
                  {p.id === selectedId && (
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      <PromptDetailPanel
                        prompt={p}
                        privacy={privacy}
                        onClose={() => setSelectedId(null)}
                      />
                    </div>
                  )}
                </React.Fragment>
              ))
            )}
          </>
        )}
      </Flex>
    </Surface>
  );
};
