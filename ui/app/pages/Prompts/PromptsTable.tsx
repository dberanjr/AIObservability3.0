import React, { useMemo, useState, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  RefreshIcon,
  SettingIcon,
} from "@dynatrace/strato-icons";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState } from "../../components/EmptyState";
import { fmtMs, fmtPercent, fmtTokens } from "../../data/format";
import { costOf } from "../../data/pricing";
import type { PromptRow } from "./usePrompts";
import type { PrivacyMode } from "./PromptsSidebar";
import { maskPII } from "./privacy";
import { usePersistedState } from "../../state/usePersistedState";
import { PromptDetailPanel } from "./PromptDetailPanel";
import { SAMPLE_SIZE } from "./usePromptSummary";
import {
  tempColor,
  anomalyLevel,
  fmtCentsCost,
  qualityColor,
  type AnomalyLevel,
  type Thr,
} from "./promptCells";
import {
  anyRowHasEval,
  evalTableRows,
  EVAL_INVERTED,
  type EvalMetric,
} from "./evalTable";
import { handleRadioGroupKeyDown, radioTabIndex } from "./radioNav";

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

// Truncated rows (response cut off at the max-tokens limit) get a softer amber
// gradient + amber left border, using the same visual language as errors but a
// lower-severity tone. Errors take precedence when both apply.
const TRUNC_ROW_BG =
  "linear-gradient(90deg, color-mix(in oklab, var(--amber) 18%, transparent), color-mix(in oklab, var(--amber) 4%, transparent))";

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

// In/Out cost are client-side ESTIMATES (tokens × a static price table), not
// measured spend — mark the columns so they aren't read as billed amounts
// (Prompts-8). The trailing "~" echoes the estimate convention used elsewhere.
const COST_EST_TITLE =
  "Estimated from token counts × model pricing (static price table) — not billed spend.";
const IN_COST_LABEL = (
  <>
    In cost <span style={{ color: "var(--text-4)" }}>~</span>
  </>
);
const OUT_COST_LABEL = (
  <>
    Out cost <span style={{ color: "var(--text-4)" }}>~</span>
  </>
);

const HeaderCell = ({
  children,
  width,
  align,
  sortBy,
  activeSort,
  onSort,
  title,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  sortBy?: SortKey;
  activeSort?: { key: SortKey; dir: SortDir };
  onSort?: (key: SortKey) => void;
  title?: string;
}) => {
  const isActive = sortBy && activeSort?.key === sortBy;
  const Arrow = isActive && activeSort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
  // aria-sort lets assistive tech announce the sorted column + direction.
  const ariaSort: React.AriaAttributes["aria-sort"] = sortBy
    ? isActive
      ? activeSort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none"
    : undefined;
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
  const content =
    !sortBy || !onSort ? (
      children
    ) : (
      <button
        type="button"
        onClick={() => onSort(sortBy)}
        style={{ all: "unset", cursor: "pointer", width: "100%" }}
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
  return (
    <div role="columnheader" aria-sort={ariaSort} title={title} style={baseStyle}>
      {content}
    </div>
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
    onKeyDown={handleRadioGroupKeyDown}
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
          tabIndex={radioTabIndex(active)}
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
          role="group"
          aria-label="Toggle columns"
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
    role="row"
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
      <HeaderCell width={70} align="right" sortBy="inCost" activeSort={sort} onSort={onSort} title={COST_EST_TITLE}>
        {IN_COST_LABEL}
      </HeaderCell>
    )}
    {visibleCols.has("out_cost") && (
      <HeaderCell width={70} align="right" sortBy="outCost" activeSort={sort} onSort={onSort} title={COST_EST_TITLE}>
        {OUT_COST_LABEL}
      </HeaderCell>
    )}
    {visibleCols.has("input") && <HeaderCell>Input</HeaderCell>}
    {visibleCols.has("output") && <HeaderCell>Output</HeaderCell>}
    {visibleCols.has("system_prompt") && <HeaderCell width={140}>System prompt</HeaderCell>}
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

// ---- Anomaly highlighting -------------------------------------------------
// Flag unusually HIGH duration / token / cost values relative to the rows on
// screen, so the user is visually cued to slow or expensive calls. Thresholds
// are percentile-based (p90 → "elevated", p98 → "outlier") and only kick in
// once there are enough samples to be meaningful. Anomalies are cued with bold
// weight + a ▲ marker (Prompts-3) — NOT red/amber, which now mean failure only.
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

/**
 * Numeric right-aligned cell that cues an anomaly with WEIGHT + a ▲ marker
 * instead of colour (Prompts-3). The tooltip notes the cue is relative to the
 * loaded sample (Prompts-9), not the whole timeframe.
 */
const NumCell = ({
  level,
  width,
  label,
  children,
}: {
  level: AnomalyLevel;
  width: number;
  label: string;
  children: React.ReactNode;
}) => {
  if (level === "none") {
    return (
      <Cell width={width} align="right" mono>
        {children}
      </Cell>
    );
  }
  const kind = level === "outlier" ? "Outlier" : "Elevated";
  return (
    <Cell
      width={width}
      align="right"
      mono
      style={{ fontWeight: 600 }}
      title={`${kind} ${label} — relative to the ${SAMPLE_SIZE}-row loaded sample`}
    >
      {level === "outlier" && (
        <span aria-hidden style={{ color: "var(--text-2)", marginRight: 3 }}>
          ▲
        </span>
      )}
      {children}
    </Cell>
  );
};

/** Build per-column thresholds from the displayed rows. */
export const computeAnomalyStats = (rows: PromptRow[]): AnomalyStats => ({
  duration: thresholdsFor(rows.map((r) => r.durationMs)),
  inTok: thresholdsFor(rows.map((r) => r.inTokens)),
  outTok: thresholdsFor(rows.map((r) => r.outTokens)),
  inCost: thresholdsFor(
    rows.map((r) => (r.inTokens > 0 ? costOf(r.inTokens, 0, r.model) : 0)),
  ),
  outCost: thresholdsFor(
    rows.map((r) => (r.outTokens > 0 ? costOf(0, r.outTokens, r.model) : 0)),
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

  const inCost = prompt.inTokens > 0 ? costOf(prompt.inTokens, 0, prompt.model) : 0;
  const outCost =
    prompt.outTokens > 0 ? costOf(0, prompt.outTokens, prompt.model) : 0;

  const inTokLvl = anomalyLevel(prompt.inTokens, stats.inTok);
  const outTokLvl = anomalyLevel(prompt.outTokens, stats.outTok);
  const durLvl = anomalyLevel(prompt.durationMs, stats.duration);
  const inCostLvl = anomalyLevel(inCost, stats.inCost);
  const outCostLvl = anomalyLevel(outCost, stats.outCost);

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
            : prompt.truncated
              ? "3px solid var(--amber)"
              : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : prompt.hasError
            ? ERROR_ROW_BG
            : prompt.truncated
              ? TRUNC_ROW_BG
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
        <NumCell level={inTokLvl} width={70} label="input tokens">
          {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
        </NumCell>
      )}
      {visibleCols.has("out_tok") && (
        <NumCell level={outTokLvl} width={70} label="output tokens">
          {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
        </NumCell>
      )}
      {visibleCols.has("temperature") && (
        <Cell width={64} align="right">
          <TempCell t={prompt.temperature} />
        </Cell>
      )}
      {visibleCols.has("duration") && (
        <NumCell level={durLvl} width={90} label="duration">
          {prompt.durationMs > 0 ? fmtMs(prompt.durationMs) : "—"}
        </NumCell>
      )}
      {visibleCols.has("in_cost") && (
        <NumCell level={inCostLvl} width={70} label="input cost (est.)">
          {fmtCentsCost(inCost)}
        </NumCell>
      )}
      {visibleCols.has("out_cost") && (
        <NumCell level={outCostLvl} width={70} label="output cost (est.)">
          {fmtCentsCost(outCost)}
        </NumCell>
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
    role="row"
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
      <HeaderCell width={70} align="right" sortBy="inCost" activeSort={sort} onSort={onSort} title={COST_EST_TITLE}>
        {IN_COST_LABEL}
      </HeaderCell>
    )}
    {visibleCols.has("out_cost") && (
      <HeaderCell width={70} align="right" sortBy="outCost" activeSort={sort} onSort={onSort} title={COST_EST_TITLE}>
        {OUT_COST_LABEL}
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
  const inCost = prompt.inTokens > 0 ? costOf(prompt.inTokens, 0, prompt.model) : 0;
  const outCost =
    prompt.outTokens > 0 ? costOf(0, prompt.outTokens, prompt.model) : 0;

  const inTokLvl = anomalyLevel(prompt.inTokens, stats.inTok);
  const outTokLvl = anomalyLevel(prompt.outTokens, stats.outTok);
  const durLvl = anomalyLevel(prompt.durationMs, stats.duration);
  const inCostLvl = anomalyLevel(inCost, stats.inCost);
  const outCostLvl = anomalyLevel(outCost, stats.outCost);

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
            : prompt.truncated
              ? "3px solid var(--amber)"
              : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : prompt.hasError
            ? ERROR_ROW_BG
            : prompt.truncated
              ? TRUNC_ROW_BG
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
        <NumCell level={durLvl} width={90} label="duration">
          {prompt.durationMs > 0 ? fmtMs(prompt.durationMs) : "—"}
        </NumCell>
      )}
      {visibleCols.has("in_tok") && (
        <NumCell level={inTokLvl} width={70} label="input tokens">
          {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
        </NumCell>
      )}
      {visibleCols.has("out_tok") && (
        <NumCell level={outTokLvl} width={70} label="output tokens">
          {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
        </NumCell>
      )}
      {visibleCols.has("in_cost") && (
        <NumCell level={inCostLvl} width={70} label="input cost (est.)">
          {fmtCentsCost(inCost)}
        </NumCell>
      )}
      {visibleCols.has("out_cost") && (
        <NumCell level={outCostLvl} width={70} label="output cost (est.)">
          {fmtCentsCost(outCost)}
        </NumCell>
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

// ---- Evaluations view (Prompts-1) ----------------------------------------
// The eval scores each row already carries, finally rendered as a table instead
// of the permanent setup-guide empty state. Values are 0..1; shown as a percent
// with the same quality thresholds as the aggregate panel, worst-first.
const EVAL_COLUMNS: { key: EvalMetric; label: string }[] = [
  { key: "evalHallucination", label: "Hallucination" },
  { key: "evalCorrectness", label: "Correctness" },
  { key: "evalFaithfulness", label: "Faithfulness" },
  { key: "evalRelevance", label: "Relevance" },
];

const EvalScoreCell = ({
  value,
  metric,
}: {
  value: number | null;
  metric: EvalMetric;
}) => {
  if (value == null) {
    return (
      <Cell width={110} align="right">
        <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
      </Cell>
    );
  }
  const pct = value * 100;
  return (
    <Cell
      width={110}
      align="right"
      mono
      color={qualityColor(pct, EVAL_INVERTED[metric])}
      style={{ fontWeight: 600 }}
    >
      {fmtPercent(pct, 0)}
    </Cell>
  );
};

const EvalHeader = () => (
  <Flex
    role="row"
    alignItems="center"
    style={{ padding: "0 10px", borderLeft: "3px solid transparent" }}
  >
    <HeaderCell width={132}>Time</HeaderCell>
    <HeaderCell width={160}>AI app</HeaderCell>
    <HeaderCell width={160}>Model</HeaderCell>
    {EVAL_COLUMNS.map((c) => (
      <HeaderCell key={c.key} width={110} align="right">
        {c.label}
      </HeaderCell>
    ))}
    <HeaderCell>{""}</HeaderCell>
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const EvalRow = ({
  prompt,
  onClick,
  isSelected,
}: {
  prompt: PromptRow;
  onClick: (p: PromptRow) => void;
  isSelected: boolean;
}) => (
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
      borderLeft: isSelected ? "3px solid var(--blue)" : "3px solid transparent",
      cursor: "pointer",
      background: isSelected
        ? "color-mix(in oklab, var(--blue) 8%, transparent)"
        : undefined,
    }}
  >
    <Cell width={132}>
      <TimeCell ms={prompt.timestampMs} />
    </Cell>
    <Cell width={160} mono color="var(--text-2)">
      {prompt.service}
    </Cell>
    <Cell width={160} mono color="var(--text-2)">
      {prompt.model ?? "—"}
    </Cell>
    {EVAL_COLUMNS.map((c) => (
      <EvalScoreCell key={c.key} value={prompt[c.key]} metric={c.key} />
    ))}
    <Cell>{""}</Cell>
    <Cell width={24}>
      <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
    </Cell>
  </div>
);

// Row-border / anomaly key so the overloaded colours are decodable at a glance
// without hovering (Prompts-3).
const LegendSwatch = ({ color, label }: { color: string; label: string }) => (
  <Flex alignItems="center" gap={4} style={{ flex: "0 0 auto" }}>
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: color,
        flex: "0 0 auto",
      }}
    />
    <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>{label}</Text>
  </Flex>
);

const RowLegend = () => (
  <Flex
    alignItems="center"
    gap={12}
    flexWrap="wrap"
    style={{ padding: "6px 16px", borderBottom: "1px solid var(--border)" }}
  >
    <LegendSwatch color="var(--blue)" label="selected" />
    <LegendSwatch color="var(--red)" label="error" />
    <LegendSwatch color="var(--amber)" label="truncated" />
    <Flex alignItems="center" gap={4} style={{ flex: "0 0 auto" }}>
      <span aria-hidden style={{ color: "var(--text-2)", fontSize: 11 }}>
        ▲
      </span>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
        outlier vs loaded sample
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
  /** Reset every sidebar/facet/status/range filter + focus (Prompts-7). */
  onResetFilters?: () => void;
  /** Human-readable active constraints, echoed in the empty state (Prompts-7). */
  filterSummary?: string[];
}

const PromptsTableBody = ({
  view,
  prompts,
  isLoading,
  privacy,
  onRefresh,
  onResetFilters,
  filterSummary,
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

  // Evaluations view (Prompts-1): the eval scores each row already carries.
  const hasEvalData = useMemo(() => anyRowHasEval(prompts), [prompts]);
  const evalRows = useMemo(() => evalTableRows(filtered), [filtered]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedId]);

  const isEval = view === "evaluations";
  const rows = isEval ? evalRows : sorted;
  const constraints = filterSummary ?? [];
  const toggleSelect = (id: string) =>
    setSelectedId(selectedId === id ? null : id);

  // Filtered-empty recovery (Prompts-7): name the responsible constraints and
  // offer a one-click reset instead of a dead-end one-liner.
  const emptyBody = localSearch ? (
    <EmptyState
      bare
      title="No loaded rows match your filter"
      description="The toolbar box filters only the rows already loaded below."
      actions={[{ label: "Clear filter", onClick: () => setLocalSearch("") }]}
    />
  ) : (
    <EmptyState
      bare
      title="No prompts match the current filters"
      description={
        constraints.length > 0
          ? `Active: ${constraints.join(" • ")}`
          : "Nothing in the current scope matches — this window may also lack instrumented AI spans."
      }
      hint={
        constraints.length > 0
          ? "Relax a constraint above, or clear everything to start over."
          : undefined
      }
      actions={
        onResetFilters
          ? [{ label: "Clear all filters", onClick: onResetFilters }]
          : undefined
      }
    />
  );

  return (
      <Flex flexDirection="column" gap={0}>
        {isEval && !hasEvalData ? (
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
              <Text style={{ fontSize: 11.5, color: "var(--text-3)", flex: "0 0 auto" }}>
                {isEval ? `${rows.length} scored · worst first` : `${rows.length} shown`}
              </Text>
              {/* Sort + anomaly cues operate on the loaded sample, not the full
                  timeframe — say so explicitly (Prompts-9). */}
              <span
                title={`The list is capped at ${SAMPLE_SIZE} rows. Sort order and anomaly (▲) cues are computed over this loaded sample, not the entire timeframe.`}
                style={{
                  flex: "0 0 auto",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  cursor: "help",
                }}
              >
                ≤{SAMPLE_SIZE}-row sample
              </span>
              <input
                type="text"
                placeholder="Filter loaded rows…"
                aria-label="Filter loaded rows"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                title="Filters only the rows loaded below. Use the sidebar Search to filter the full population before the 200-row cap."
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
              {!isEval && (
                <ColumnSelector
                  visibleCols={visibleCols}
                  onToggle={toggleColumn}
                  columns={view === "stream" ? STREAM_COLUMNS : METADATA_COLUMNS}
                />
              )}
            </Flex>

            {!isEval && <RowLegend />}

            <div role="table" aria-label="Prompts">
              <div role="rowgroup">
                {isEval ? (
                  <EvalHeader />
                ) : view === "stream" ? (
                  <StreamHeader sort={sort} onSort={toggleSort} visibleCols={visibleCols} />
                ) : (
                  <MetadataHeader sort={sort} onSort={toggleSort} visibleCols={visibleCols} />
                )}
              </div>
              <div role="rowgroup">
                {isLoading && rows.length === 0 ? (
                  <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} style={{ height: 36 }} />
                    ))}
                  </Flex>
                ) : rows.length === 0 ? (
                  emptyBody
                ) : (
                  rows.map((p) => (
                    <React.Fragment key={p.id}>
                      {isEval ? (
                        <EvalRow
                          prompt={p}
                          onClick={() => toggleSelect(p.id)}
                          isSelected={p.id === selectedId}
                        />
                      ) : view === "stream" ? (
                        <StreamRow
                          prompt={p}
                          privacy={privacy}
                          onClick={() => toggleSelect(p.id)}
                          isSelected={p.id === selectedId}
                          visibleCols={visibleCols}
                          stats={anomalyStats}
                        />
                      ) : (
                        <MetadataRow
                          prompt={p}
                          onClick={() => toggleSelect(p.id)}
                          isSelected={p.id === selectedId}
                          visibleCols={visibleCols}
                          stats={anomalyStats}
                        />
                      )}
                      {p.id === selectedId && (
                        <div
                          role="presentation"
                          style={{ borderTop: "1px solid var(--border)" }}
                        >
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
              </div>
            </div>
          </>
        )}
      </Flex>
  );
};

export const PromptsTable = (props: PromptsTableProps) => (
  <CollapsibleCard
    title="Prompts"
    headerRight={
      <ViewSegmented value={props.view} onChange={props.onViewChange} />
    }
    defaultOpen
  >
    <PromptsTableBody {...props} />
  </CollapsibleCard>
);
