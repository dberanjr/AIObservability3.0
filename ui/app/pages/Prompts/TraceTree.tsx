import React, { useState, useMemo, useRef, useEffect } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SettingIcon,
  MaximizeIcon,
  MinimizeIcon,
} from "@dynatrace/strato-icons";
import { fmtMs, fmtTokens } from "../../data/format";
import type { TraceSpan } from "./useTraceSpans";

interface TraceNode {
  span: TraceSpan;
  children: TraceNode[];
}

export type SpanCategory = "agent" | "llm" | "tool" | "other";

/** Classify a span for the waterfall's color, label, and Indicators filter. */
export const spanCategory = (s: TraceSpan): SpanCategory => {
  if (s.provider) return "llm";
  if (s.agentName || s.tlKind === "workflow") return "agent";
  if (s.toolName || s.tlKind === "task" || s.name.endsWith(".task")) return "tool";
  return "other";
};

export const CAT_COLOR: Record<SpanCategory, string> = {
  agent: "var(--purple)",
  llm: "var(--blue)",
  tool: "var(--green)",
  other: "var(--text-3)",
};
const CAT_LABEL: Record<SpanCategory, string> = {
  agent: "agent",
  llm: "llm",
  tool: "tool",
  other: "",
};

export interface IndicatorState {
  agent: boolean;
  llm: boolean;
  tool: boolean;
  other: boolean;
}
const DEFAULT_INDICATORS: IndicatorState = {
  agent: true,
  llm: true,
  tool: true,
  other: false,
};

/** True when any searchable field on the span contains `term` (lower-cased). */
export const spanMatchesTerm = (span: TraceSpan, term: string): boolean => {
  if (!term) return false;
  const hay = [
    span.name,
    span.service,
    span.provider,
    span.model,
    span.operation,
    span.agentName,
    span.toolName,
    span.workflow,
    span.exceptionType,
    span.exceptionMsg,
    span.spanId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(term);
};

interface FlatRow {
  node: TraceNode;
  depth: number;
}

/** DFS flatten, skipping children of collapsed nodes. Order = waterfall order. */
const flattenTree = (
  roots: TraceNode[],
  collapsed: Set<string>,
): FlatRow[] => {
  const out: FlatRow[] = [];
  const walk = (node: TraceNode, depth: number) => {
    out.push({ node, depth });
    if (!collapsed.has(node.span.spanId)) {
      node.children.forEach((c) => walk(c, depth + 1));
    }
  };
  roots.forEach((r) => walk(r, 0));
  return out;
};

/** The trace's time window: earliest start → latest end across all spans. */
const traceWindow = (
  spans: TraceSpan[],
): { t0: number; total: number } => {
  if (spans.length === 0) return { t0: 0, total: 1 };
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const s of spans) {
    if (s.timestampMs < t0) t0 = s.timestampMs;
    const end = s.timestampMs + Math.max(0, s.durationMs);
    if (end > t1) t1 = end;
  }
  return { t0, total: Math.max(1, t1 - t0) };
};

/**
 * Build the span tree keeping only spans whose category is enabled. Children of
 * a hidden span re-attach to the nearest visible ancestor, so hiding e.g. the
 * GET/SET "other" spans doesn't orphan the agent/LLM spans beneath them.
 */
const buildFilteredTree = (
  spans: TraceSpan[],
  enabled: IndicatorState,
): TraceNode[] => {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const visible = new Map<string, TraceSpan>();
  for (const s of spans) if (enabled[spanCategory(s)]) visible.set(s.spanId, s);

  const nearestVisibleParent = (s: TraceSpan): string | null => {
    let p = s.parentSpanId;
    while (p) {
      if (visible.has(p)) return p;
      p = byId.get(p)?.parentSpanId ?? null;
    }
    return null;
  };

  const nodes = new Map<string, TraceNode>();
  visible.forEach((s) => nodes.set(s.spanId, { span: s, children: [] }));
  const roots: TraceNode[] = [];
  visible.forEach((s) => {
    const node = nodes.get(s.spanId)!;
    const pv = nearestVisibleParent(s);
    if (pv && nodes.has(pv)) nodes.get(pv)!.children.push(node);
    else roots.push(node);
  });

  const sortChildren = (node: TraceNode) => {
    node.children.sort((a, b) => a.span.timestampMs - b.span.timestampMs);
    node.children.forEach(sortChildren);
  };
  roots.sort((a, b) => a.span.timestampMs - b.span.timestampMs);
  roots.forEach(sortChildren);
  return roots;
};

// Width of the left Name column within the waterfall (% of the tree column).
const NAME_FLEX = "0 0 44%";

/** One waterfall row: indented name on the left, a positioned timing bar on a
 *  shared timeline axis on the right. */
const WaterfallRow = ({
  row,
  hasChildren,
  isCollapsed,
  onToggle,
  isSelected,
  onSelect,
  highlight,
  t0,
  total,
  showTokens,
}: {
  row: FlatRow;
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: (spanId: string) => void;
  isSelected: boolean;
  onSelect: (spanId: string) => void;
  highlight?: string;
  t0: number;
  total: number;
  showTokens: boolean;
}) => {
  const { node, depth } = row;
  const span = node.span;
  const cat = spanCategory(span);
  const color = CAT_COLOR[cat];
  const prefix = cat === "other" ? span.spanKind : CAT_LABEL[cat];
  const isMatch = !!highlight && spanMatchesTerm(span, highlight);
  const dimmed = !!highlight && !isMatch;

  const leftPct = Math.max(0, Math.min(100, ((span.timestampMs - t0) / total) * 100));
  const widthPct = Math.max(
    0.6,
    Math.min(100 - leftPct, (Math.max(0, span.durationMs) / total) * 100),
  );
  const endPct = leftPct + widthPct;
  // Where to draw the duration label so it never collides with adjacent columns:
  //  - wide bar  → inside, at the bar's right end (white text)
  //  - room right → just after the bar end
  //  - otherwise → just before the bar start (bar hugs the right edge)
  const labelPlacement: "inside" | "after" | "before" =
    widthPct >= 18 ? "inside" : endPct < 82 ? "after" : "before";
  const labelStyle: React.CSSProperties =
    labelPlacement === "inside"
      ? { right: `${Math.max(0, 100 - endPct)}%`, marginRight: 6, color: "#fff" }
      : labelPlacement === "after"
        ? { left: `${endPct}%`, marginLeft: 4, color: "var(--text-3)" }
        : { right: `${100 - leftPct}%`, marginRight: 4, color: "var(--text-3)" };

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onSelect(span.spanId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(span.spanId);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: 26,
        cursor: "pointer",
        borderLeft: isSelected
          ? "2px solid var(--blue)"
          : isMatch
            ? "2px solid var(--amber)"
            : "2px solid transparent",
        background: isSelected
          ? "color-mix(in oklab, var(--blue) 12%, transparent)"
          : isMatch
            ? "color-mix(in oklab, var(--amber) 16%, transparent)"
            : undefined,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {/* Name column */}
      <div
        style={{
          flex: NAME_FLEX,
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          paddingLeft: 6 + depth * 14,
          paddingRight: 8,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(span.spanId);
            }}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              flex: "0 0 auto",
            }}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
            ) : (
              <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
            )}
          </button>
        ) : (
          <div style={{ width: 14, flex: "0 0 auto" }} />
        )}
        <div
          style={{
            width: 6,
            height: 12,
            borderRadius: 2,
            background: color,
            flex: "0 0 auto",
          }}
        />
        {prefix && (
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color,
              flex: "0 0 auto",
            }}
          >
            {prefix}
          </Text>
        )}
        <Text
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {span.name}
        </Text>
      </div>

      {/* Token columns (only when the trace carries token data) */}
      {showTokens && (
        <>
          <div
            style={{
              flex: "0 0 50px",
              textAlign: "right",
              paddingRight: 8,
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-2)",
            }}
          >
            {span.inTokens > 0 ? fmtTokens(span.inTokens) : ""}
          </div>
          <div
            style={{
              flex: "0 0 50px",
              textAlign: "right",
              paddingRight: 8,
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-2)",
            }}
          >
            {span.outTokens > 0 ? fmtTokens(span.outTokens) : ""}
          </div>
        </>
      )}

      {/* Timeline column */}
      <div
        style={{
          flex: "1 1 0",
          minWidth: 80,
          position: "relative",
          height: 16,
          borderLeft: "1px solid var(--border)",
        }}
      >
        <div
          title={`${fmtMs(span.durationMs)} · +${fmtMs(span.timestampMs - t0)} from start`}
          style={{
            position: "absolute",
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            top: 2,
            height: 12,
            borderRadius: 3,
            background: color,
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            fontSize: 10,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            ...labelStyle,
          }}
        >
          {fmtMs(span.durationMs)}
        </span>
      </div>
    </div>
  );
};

interface SpanAttributesPanelProps {
  span: TraceSpan;
  maxHeight?: number;
  maximized?: boolean;
  onToggleMaximize?: () => void;
}

type AttrType = "string" | "number" | "bool" | "time" | "duration" | "id";
interface Attr {
  label: string;
  value: string | number | boolean | null;
  type: AttrType;
}
interface AttrSectionData {
  title: string;
  rows: Attr[];
}

// Value colors mirror the Distributed Tracing app: strings teal, numerics
// (numbers / durations / timestamps) purple, booleans amber.
const STRING_COLOR = "#0E8A8A";
const NUM_COLOR = "var(--purple-2)";
const BOOL_COLOR = "var(--amber)";

const attrColor = (t: AttrType): string => {
  if (t === "bool") return BOOL_COLOR;
  if (t === "number" || t === "time" || t === "duration") return NUM_COLOR;
  if (t === "id") return "var(--text-2)";
  return STRING_COLOR;
};

const fmtAttr = (a: Attr): string => {
  if (a.value == null || a.value === "") return "—";
  switch (a.type) {
    case "duration":
      return fmtMs(Number(a.value));
    case "time":
      try {
        return new Date(Number(a.value)).toISOString();
      } catch {
        return String(a.value);
      }
    case "number":
      return Number(a.value).toLocaleString();
    default:
      return String(a.value);
  }
};

const present = (rows: Attr[]): Attr[] =>
  rows.filter((a) => a.value !== null && a.value !== "");

const buildSections = (span: TraceSpan): AttrSectionData[] => {
  const sections: AttrSectionData[] = [
    {
      title: "Core",
      rows: present([
        { label: "Endpoint", value: span.endpoint, type: "string" },
        { label: "Span kind", value: span.spanKind, type: "string" },
        { label: "Span name", value: span.name, type: "string" },
        { label: "Service", value: span.service, type: "string" },
        { label: "Duration", value: span.durationMs, type: "duration" },
        { label: "Status", value: span.statusCode, type: "string" },
        {
          label: "Request is root span",
          value: span.isRoot,
          type: "bool",
        },
        { label: "Start time", value: span.timestampMs, type: "time" },
        { label: "End time", value: span.endTimeMs, type: "time" },
      ]),
    },
    {
      title: "Gen AI",
      rows: present([
        { label: "Provider", value: span.provider, type: "string" },
        { label: "Model", value: span.model, type: "string" },
        { label: "Operation", value: span.operation, type: "string" },
        { label: "Agent", value: span.agentName, type: "string" },
        { label: "Tool", value: span.toolName, type: "string" },
        {
          label: "Input tokens",
          value: span.inTokens > 0 ? span.inTokens : null,
          type: "number",
        },
        {
          label: "Output tokens",
          value: span.outTokens > 0 ? span.outTokens : null,
          type: "number",
        },
      ]),
    },
    {
      title: "Langchain",
      rows: present([
        { label: "Workflow", value: span.workflow, type: "string" },
        { label: "Entity name", value: span.tlEntity, type: "string" },
        { label: "Entity path", value: span.tlEntityPath, type: "string" },
        { label: "Span kind", value: span.tlKind, type: "string" },
      ]),
    },
    {
      title: "Code attributes",
      rows: present([
        { label: "CPU self time", value: span.cpuSelfMs, type: "duration" },
        { label: "CPU time", value: span.cpuMs, type: "duration" },
        { label: "Code function", value: span.codeFunction, type: "string" },
        { label: "Code namespace", value: span.codeNamespace, type: "string" },
      ]),
    },
    {
      title: "Error",
      rows: present([
        { label: "Exception type", value: span.exceptionType, type: "string" },
        { label: "Exception message", value: span.exceptionMsg, type: "string" },
      ]),
    },
    {
      title: "Identifiers",
      rows: present([
        { label: "Span ID", value: span.spanId, type: "id" },
        { label: "Parent span ID", value: span.parentSpanId, type: "id" },
        { label: "Session ID", value: span.sessionId, type: "id" },
      ]),
    },
  ];
  return sections.filter((s) => s.rows.length > 0);
};

// Sections expanded by default; the rest (Code attributes, Error, Identifiers)
// start collapsed.
const OPEN_BY_DEFAULT = new Set(["Core", "Gen AI", "Langchain"]);

const AttrSection = ({
  section,
  defaultOpen = true,
}: {
  section: AttrSectionData;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
        }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
          {section.title}
        </Text>
        {open ? (
          <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
        ) : (
          <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
        )}
      </button>
      {open && (
        <div style={{ padding: "0 10px 8px" }}>
          {section.rows.map((a) => (
            <div
              key={a.label}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(96px, 40%) 1fr",
                gap: 8,
                padding: "5px 0",
                borderTop: "1px solid var(--border)",
                alignItems: "baseline",
              }}
            >
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                {a.label}
              </Text>
              <Text
                style={{
                  fontSize: 11.5,
                  fontFamily:
                    a.type === "id" ? "var(--mono, monospace)" : undefined,
                  color: attrColor(a.type),
                  wordBreak: "break-word",
                }}
              >
                {fmtAttr(a)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SpanAttributesPanel = ({
  span,
  maxHeight,
  maximized,
  onToggleMaximize,
}: SpanAttributesPanelProps) => {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const sections = useMemo(() => {
    const all = buildSections(span);
    if (!term) return all;
    return all
      .map((s) => ({
        ...s,
        rows: s.rows.filter((a) =>
          `${a.label} ${fmtAttr(a)}`.toLowerCase().includes(term),
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [span, term]);

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex alignItems="flex-start" justifyContent="space-between" gap={8}>
        <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {span.name}
          </Text>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {span.service} · {fmtMs(span.durationMs)}
          </Text>
        </Flex>
        {onToggleMaximize && (
          <button
            type="button"
            onClick={onToggleMaximize}
            title={maximized ? "Restore" : "Maximize attributes"}
            aria-label={maximized ? "Restore attributes" : "Maximize attributes"}
            style={{
              all: "unset",
              cursor: "pointer",
              color: "var(--text-3)",
              flex: "0 0 auto",
              padding: 2,
            }}
          >
            {maximized ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
          </button>
        )}
      </Flex>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search attributes"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 8px",
          fontSize: 12,
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text)",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: maxHeight ?? 360,
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: 4,
        }}
      >
        {sections.length === 0 ? (
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            No attributes match your search.
          </Text>
        ) : (
          sections.map((s) => (
            // Remount when a search term toggles so collapsed sections open to
            // reveal matches (and revert to their default when search clears).
            <AttrSection
              key={`${s.title}:${term ? "q" : ""}`}
              section={s}
              defaultOpen={!!term || OPEN_BY_DEFAULT.has(s.title)}
            />
          ))
        )}
      </div>
    </Flex>
  );
};

export interface TraceTreeProps {
  spans: TraceSpan[];
  isLoading: boolean;
  /** Search term — matching spans are highlighted, non-matches dimmed. */
  highlight?: string;
  /** Max height of the scrollable tree area (px). Defaults to 300. */
  maxHeight?: number;
  /** Controlled selection — when provided, the parent owns the selected span. */
  selectedSpanId?: string | null;
  onSelectSpan?: (spanId: string | null) => void;
}

const eyebrow: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const IND_ITEMS: { key: keyof IndicatorState; label: string }[] = [
  { key: "agent", label: "Agent calls" },
  { key: "llm", label: "LLM calls" },
  { key: "tool", label: "Tool calls" },
  { key: "other", label: "All other service spans" },
];

/** Gear → "Indicators" popover toggling which span categories the waterfall shows. */
const IndicatorsMenu = ({
  value,
  onChange,
}: {
  value: IndicatorState;
  onChange: (next: IndicatorState) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Choose which spans to display"
        aria-label="Indicators"
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          padding: 2,
          color: "var(--text-3)",
        }}
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
            borderRadius: 8,
            padding: 8,
            zIndex: 1000,
            minWidth: 200,
            boxShadow: "var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.10))",
          }}
        >
          <Text style={{ ...eyebrow, display: "block", padding: "2px 6px 6px" }}>
            Indicators
          </Text>
          {IND_ITEMS.map((it) => (
            <label
              key={it.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px",
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text)",
              }}
            >
              <input
                type="checkbox"
                checked={value[it.key]}
                onChange={() => onChange({ ...value, [it.key]: !value[it.key] })}
                style={{ cursor: "pointer" }}
              />
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: CAT_COLOR[it.key],
                  flex: "0 0 auto",
                }}
              />
              {it.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export const TraceTree = ({
  spans,
  isLoading,
  highlight,
  maxHeight = 300,
  selectedSpanId: controlledSelected,
  onSelectSpan,
}: TraceTreeProps) => {
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [indicators, setIndicators] = useState<IndicatorState>(DEFAULT_INDICATORS);
  const [attrsMaximized, setAttrsMaximized] = useState(false);
  const selectedSpanId =
    controlledSelected !== undefined ? controlledSelected : uncontrolledSelected;
  const selectSpan = (id: string) => {
    // Toggle off if the same span is clicked again.
    const next = id === selectedSpanId ? null : id;
    if (onSelectSpan) onSelectSpan(next);
    if (controlledSelected === undefined) setUncontrolledSelected(next);
    if (next === null) setAttrsMaximized(false);
  };
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const { t0, total } = useMemo(() => traceWindow(spans), [spans]);
  const roots = useMemo(
    () => buildFilteredTree(spans, indicators),
    [spans, indicators],
  );
  const rows = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed]);
  const showTokens = useMemo(
    () => spans.some((s) => s.inTokens > 0 || s.outTokens > 0),
    [spans],
  );
  const selectedSpan = useMemo(
    () => spans.find((s) => s.spanId === selectedSpanId) ?? null,
    [spans, selectedSpanId],
  );
  // Maximized only takes effect with a span selected (so the waterfall is never
  // hidden with nothing to show).
  const maxed = attrsMaximized && !!selectedSpan;

  if (isLoading) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>Loading trace...</Text>
      </div>
    );
  }

  if (spans.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No spans found in trace</Text>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {!maxed && (
      <div style={{ flex: "1 1 360px", minWidth: 300 }}>
        {/* Header: Name + Indicators gear, then the shared time axis. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "4px 0 6px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              flex: NAME_FLEX,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingRight: 8,
            }}
          >
            <Text style={eyebrow}>Name</Text>
            <IndicatorsMenu value={indicators} onChange={setIndicators} />
          </div>
          {showTokens && (
            <>
              <div style={{ flex: "0 0 50px", textAlign: "right", paddingRight: 8 }}>
                <Text style={eyebrow}>In</Text>
              </div>
              <div style={{ flex: "0 0 50px", textAlign: "right", paddingRight: 8 }}>
                <Text style={eyebrow}>Out</Text>
              </div>
            </>
          )}
          <div
            style={{
              flex: "1 1 0",
              minWidth: 80,
              display: "flex",
              justifyContent: "space-between",
              borderLeft: "1px solid var(--border)",
              paddingLeft: 6,
            }}
          >
            <Text style={{ fontSize: 10, color: "var(--text-3)" }}>0</Text>
            <Text style={{ fontSize: 10, color: "var(--text-3)" }}>
              {fmtMs(total)}
            </Text>
          </div>
        </div>

        <div style={{ maxHeight, overflowY: "auto" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center" }}>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                No spans match the selected indicators.
              </Text>
            </div>
          ) : (
            rows.map(({ node, depth }) => (
              <WaterfallRow
                key={node.span.spanId}
                row={{ node, depth }}
                hasChildren={node.children.length > 0}
                isCollapsed={collapsed.has(node.span.spanId)}
                onToggle={toggleCollapse}
                isSelected={node.span.spanId === selectedSpanId}
                onSelect={selectSpan}
                highlight={highlight}
                t0={t0}
                total={total}
                showTokens={showTokens}
              />
            ))
          )}
        </div>
      </div>
      )}

      <div
        style={
          maxed
            ? { flex: "1 1 100%", minWidth: 0 }
            : { flex: "1 1 300px", minWidth: 280, maxWidth: 380 }
        }
      >
        {selectedSpan ? (
          <SpanAttributesPanel
            span={selectedSpan}
            maxHeight={maxed ? Math.round(maxHeight * 1.8) : maxHeight}
            maximized={attrsMaximized}
            onToggleMaximize={() => setAttrsMaximized((m) => !m)}
          />
        ) : (
          <div
            style={{
              padding: 16,
              border: "1px dashed var(--border)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Select a span to view its attributes.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};
