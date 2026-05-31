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
type VisibleColumn = "in_cost" | "out_cost" | "system_prompt";
type SortKey = "timestampMs" | "inTokens" | "outTokens" | "durationMs";
type SortDir = "asc" | "desc";

const VIEW_OPTIONS: { value: PromptView; label: string }[] = [
  { value: "stream", label: "Stream" },
  { value: "metadata", label: "Metadata" },
  { value: "evaluations", label: "Evaluations" },
];

const TimeCell = ({ ms }: { ms: number }) => {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return (
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 11.5,
        color: "var(--text-3)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {hh}:{mm}:{ss}
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
}: {
  visibleCols: Set<VisibleColumn>;
  onToggle: (col: VisibleColumn) => void;
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
          {["in_cost", "out_cost", "system_prompt"].map((col) => (
            <label
              key={col}
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
                checked={visibleCols.has(col as VisibleColumn)}
                onChange={() => onToggle(col as VisibleColumn)}
                style={{ cursor: "pointer" }}
              />
              {col === "in_cost"
                ? "In cost"
                : col === "out_cost"
                  ? "Out cost"
                  : "System prompt"}
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
  <Flex alignItems="center" style={{ padding: "0 10px" }}>
    <HeaderCell width={80} sortBy="timestampMs" activeSort={sort} onSort={onSort}>
      Time
    </HeaderCell>
    <HeaderCell width={140}>AI app</HeaderCell>
    <HeaderCell width={160}>Model</HeaderCell>
    <HeaderCell width={70} align="right" sortBy="inTokens" activeSort={sort} onSort={onSort}>
      In tok
    </HeaderCell>
    <HeaderCell width={70} align="right" sortBy="outTokens" activeSort={sort} onSort={onSort}>
      Out tok
    </HeaderCell>
    {visibleCols.has("in_cost") && <HeaderCell width={70} align="right">In cost</HeaderCell>}
    {visibleCols.has("out_cost") && <HeaderCell width={70} align="right">Out cost</HeaderCell>}
    <HeaderCell>Input</HeaderCell>
    <HeaderCell>Output</HeaderCell>
    {visibleCols.has("system_prompt") && <HeaderCell width={140}>System prompt</HeaderCell>}
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const fmtUSD = (cents: number): string => {
  if (!Number.isFinite(cents) || cents <= 0) return "—";
  const dollars = cents / 100;
  return `$${dollars.toFixed(4)}`;
};

const StreamRow = ({
  prompt,
  privacy,
  onClick,
  isSelected,
  visibleCols,
}: {
  prompt: PromptRow;
  privacy: PrivacyMode;
  onClick: (p: PromptRow) => void;
  isSelected: boolean;
  visibleCols: Set<VisibleColumn>;
}) => {
  const inputText = privacy === "mask" ? maskPII(prompt.promptText) : prompt.promptText;
  const outputText =
    privacy === "mask" ? maskPII(prompt.responseText) : prompt.responseText;

  const pricing = getPricing(prompt.model);
  const inCost = prompt.inTokens > 0 ? estimateCost(prompt.inTokens, 0, pricing) : 0;
  const outCost = prompt.outTokens > 0 ? estimateCost(0, prompt.outTokens, pricing) : 0;

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
        borderLeft: isSelected ? "3px solid var(--blue)" : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : prompt.hasError
            ? "color-mix(in oklab, var(--red) 4%, transparent)"
            : undefined,
      }}
    >
      <Cell width={80}>
        <TimeCell ms={prompt.timestampMs} />
      </Cell>
      <Cell width={140} mono color="var(--text-2)">
        {prompt.service}
      </Cell>
      <Cell width={160} mono color="var(--text-2)">
        {prompt.model ?? "—"}
      </Cell>
      <Cell width={70} align="right" mono>
        {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
      </Cell>
      <Cell width={70} align="right" mono>
        {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
      </Cell>
      {visibleCols.has("in_cost") && (
        <Cell width={70} align="right" mono>
          {fmtUSD(inCost)}
        </Cell>
      )}
      {visibleCols.has("out_cost") && (
        <Cell width={70} align="right" mono>
          {fmtUSD(outCost)}
        </Cell>
      )}
      <Cell title={inputText}>
        {inputText ? truncate(inputText, 80) : (
          <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
        )}
      </Cell>
      <Cell title={outputText}>
        {outputText ? truncate(outputText, 80) : (
          <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
        )}
      </Cell>
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
  <Flex alignItems="center" style={{ padding: "0 10px" }}>
    <HeaderCell width={80} sortBy="timestampMs" activeSort={sort} onSort={onSort}>
      Time
    </HeaderCell>
    <HeaderCell width={140}>AI app</HeaderCell>
    <HeaderCell width={160}>Model</HeaderCell>
    <HeaderCell width={110}>Type</HeaderCell>
    <HeaderCell width={90} align="right" sortBy="durationMs" activeSort={sort} onSort={onSort}>
      Duration
    </HeaderCell>
    <HeaderCell width={70} align="right" sortBy="inTokens" activeSort={sort} onSort={onSort}>
      In tok
    </HeaderCell>
    <HeaderCell width={70} align="right" sortBy="outTokens" activeSort={sort} onSort={onSort}>
      Out tok
    </HeaderCell>
    {visibleCols.has("in_cost") && <HeaderCell width={70} align="right">In cost</HeaderCell>}
    {visibleCols.has("out_cost") && <HeaderCell width={70} align="right">Out cost</HeaderCell>}
    <HeaderCell>Trace ID</HeaderCell>
    {visibleCols.has("system_prompt") && <HeaderCell width={140}>System prompt</HeaderCell>}
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const MetadataRow = ({
  prompt,
  onClick,
  isSelected,
  visibleCols,
}: {
  prompt: PromptRow;
  onClick: (p: PromptRow) => void;
  isSelected: boolean;
  visibleCols: Set<VisibleColumn>;
}) => {
  const pricing = getPricing(prompt.model);
  const inCost = prompt.inTokens > 0 ? estimateCost(prompt.inTokens, 0, pricing) : 0;
  const outCost = prompt.outTokens > 0 ? estimateCost(0, prompt.outTokens, pricing) : 0;

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
        borderLeft: isSelected ? "3px solid var(--blue)" : "3px solid transparent",
        cursor: "pointer",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 8%, transparent)"
          : undefined,
      }}
    >
      <Cell width={80}>
        <TimeCell ms={prompt.timestampMs} />
      </Cell>
      <Cell width={140} mono color="var(--text-2)">
        {prompt.service}
      </Cell>
      <Cell width={160} mono color="var(--text-2)">
        {prompt.model ?? "—"}
      </Cell>
      <Cell width={110}>
        <Flex gap={4}>
          <KindChip kind={prompt.kind} />
          <TypeChip label={prompt.typeLabel} />
        </Flex>
      </Cell>
      <Cell width={90} align="right" mono>
        {prompt.durationMs > 0 ? fmtMs(prompt.durationMs) : "—"}
      </Cell>
      <Cell width={70} align="right" mono>
        {prompt.inTokens > 0 ? fmtTokens(prompt.inTokens) : "—"}
      </Cell>
      <Cell width={70} align="right" mono>
        {prompt.outTokens > 0 ? fmtTokens(prompt.outTokens) : "—"}
      </Cell>
      {visibleCols.has("in_cost") && (
        <Cell width={70} align="right" mono>
          {fmtUSD(inCost)}
        </Cell>
      )}
      {visibleCols.has("out_cost") && (
        <Cell width={70} align="right" mono>
          {fmtUSD(outCost)}
        </Cell>
      )}
      <Cell mono color="var(--text-2)">
        {prompt.traceId ?? "—"}
      </Cell>
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
  const [visibleColsArray, setVisibleColsArray] = usePersistedState<VisibleColumn[]>(
    "ai-obs.prompts-visible-cols",
    ["in_cost", "out_cost"],
  );
  const visibleCols = new Set(visibleColsArray ?? []);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );

  const toggleColumn = (col: VisibleColumn) => {
    const next = new Set(visibleColsArray);
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
              <ColumnSelector visibleCols={visibleCols} onToggle={toggleColumn} />
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
                    />
                  ) : (
                    <MetadataRow
                      prompt={p}
                      onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                      isSelected={p.id === selectedId}
                      visibleCols={visibleCols}
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
