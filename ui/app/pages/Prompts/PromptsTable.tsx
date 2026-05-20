import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@dynatrace/strato-icons";
import { fmtMs, fmtTokens } from "../../data/format";
import type { PromptRow } from "./usePrompts";
import type { PrivacyMode } from "./PromptsSidebar";
import { maskPII } from "./privacy";

export type PromptView = "stream" | "metadata" | "evaluations";

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

const StreamHeader = ({
  sort,
  onSort,
}: {
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
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
    <HeaderCell>Input</HeaderCell>
    <HeaderCell>Output</HeaderCell>
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const StreamRow = ({
  prompt,
  privacy,
  onClick,
}: {
  prompt: PromptRow;
  privacy: PrivacyMode;
  onClick: (p: PromptRow) => void;
}) => {
  const inputText = privacy === "mask" ? maskPII(prompt.promptText) : prompt.promptText;
  const outputText =
    privacy === "mask" ? maskPII(prompt.responseText) : prompt.responseText;
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
        cursor: "pointer",
        background: prompt.hasError
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
        {fmtTokens(prompt.inTokens)}
      </Cell>
      <Cell width={70} align="right" mono>
        {fmtTokens(prompt.outTokens)}
      </Cell>
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
      <Cell width={24}>
        <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
      </Cell>
    </div>
  );
};

const MetadataHeader = ({
  sort,
  onSort,
}: {
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
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
    <HeaderCell>Trace ID</HeaderCell>
    <HeaderCell width={24}>{""}</HeaderCell>
  </Flex>
);

const MetadataRow = ({
  prompt,
  onClick,
}: {
  prompt: PromptRow;
  onClick: (p: PromptRow) => void;
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
      cursor: "pointer",
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
      {fmtMs(prompt.durationMs)}
    </Cell>
    <Cell width={70} align="right" mono>
      {fmtTokens(prompt.inTokens)}
    </Cell>
    <Cell width={70} align="right" mono>
      {fmtTokens(prompt.outTokens)}
    </Cell>
    <Cell mono color="var(--text-2)">
      {prompt.traceId ?? "—"}
    </Cell>
    <Cell width={24}>
      <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
    </Cell>
  </div>
);

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
  onRowClick: (p: PromptRow) => void;
}

export const PromptsTable = ({
  view,
  onViewChange,
  prompts,
  isLoading,
  privacy,
  onRowClick,
}: PromptsTableProps) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "timestampMs",
    dir: "desc",
  });

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );

  const sorted = useMemo(() => {
    const copy = [...prompts];
    copy.sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      const cmp = av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [prompts, sort]);

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
              {sorted.length} sampled
            </Text>
            <ViewSegmented value={view} onChange={onViewChange} />
          </Flex>
        </Flex>

        {view === "evaluations" ? (
          <EvaluationsEmptyState />
        ) : (
          <>
            {view === "stream" ? (
              <StreamHeader sort={sort} onSort={toggleSort} />
            ) : (
              <MetadataHeader sort={sort} onSort={toggleSort} />
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
                  No prompts match the current filters.
                </Text>
              </Flex>
            ) : (
              sorted.map((p) =>
                view === "stream" ? (
                  <StreamRow
                    key={p.id}
                    prompt={p}
                    privacy={privacy}
                    onClick={onRowClick}
                  />
                ) : (
                  <MetadataRow key={p.id} prompt={p} onClick={onRowClick} />
                ),
              )
            )}
          </>
        )}
      </Flex>
    </Surface>
  );
};
