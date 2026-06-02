import React, { useState, useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { fmtMs, fmtTokens } from "../../data/format";
import type { TraceSpan } from "./useTraceSpans";

interface TraceNode {
  span: TraceSpan;
  children: TraceNode[];
}

const buildTree = (spans: TraceSpan[]): TraceNode[] => {
  const spanMap = new Map<string, TraceNode>();
  const roots: TraceNode[] = [];

  for (const span of spans) {
    const node: TraceNode = { span, children: [] };
    spanMap.set(span.spanId, node);
  }

  for (const node of spanMap.values()) {
    if (node.span.parentSpanId) {
      const parent = spanMap.get(node.span.parentSpanId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Sort children by timestamp
  const sortChildren = (node: TraceNode) => {
    node.children.sort((a, b) => a.span.timestampMs - b.span.timestampMs);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
};

const getSpanColor = (span: TraceSpan): string => {
  if (span.provider) return "var(--blue)";
  if (span.agentName) return "var(--purple)";
  if (span.toolName) return "var(--green)";
  return "var(--text-3)";
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

const TraceTreeNode = ({
  node,
  selectedSpanId,
  onSelectSpan,
  highlight,
}: {
  node: TraceNode;
  selectedSpanId: string | null;
  onSelectSpan: (spanId: string) => void;
  highlight?: string;
}) => {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.span.spanId === selectedSpanId;
  const color = getSpanColor(node.span);
  const isMatch = !!highlight && spanMatchesTerm(node.span, highlight);
  const dimmed = !!highlight && !isMatch;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelectSpan(node.span.spanId)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderRadius: 4,
          background: isSelected
            ? "color-mix(in oklab, var(--blue) 12%, transparent)"
            : isMatch
              ? "color-mix(in oklab, var(--amber) 18%, transparent)"
              : undefined,
          borderLeft: isSelected
            ? "2px solid var(--blue)"
            : isMatch
              ? "2px solid var(--amber)"
              : "2px solid transparent",
          opacity: dimmed ? 0.45 : 1,
          width: "100%",
          minHeight: 32,
        }}
      >
        {node.children.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 0,
              flex: "0 0 auto",
            }}
          >
            {expanded ? (
              <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
            ) : (
              <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
            )}
          </button>
        )}
        {node.children.length === 0 && <div style={{ width: 14 }} />}

        <div
          style={{
            width: 6,
            height: 12,
            borderRadius: 2,
            background: color,
            flex: "0 0 auto",
          }}
        />

        <Flex
          flexDirection="column"
          gap={2}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.span.name}
          </Text>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {node.span.service} · {fmtMs(node.span.durationMs)}
          </Text>
        </Flex>
      </button>

      {expanded && node.children.length > 0 && (
        <div style={{ marginLeft: 16, borderLeft: "1px solid var(--border)" }}>
          {node.children.map((child) => (
            <TraceTreeNode
              key={child.span.spanId}
              node={child}
              selectedSpanId={selectedSpanId}
              onSelectSpan={onSelectSpan}
              highlight={highlight}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SpanAttributesPanelProps {
  span: TraceSpan;
  maxHeight?: number;
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
        { label: "Workflow", value: span.workflow, type: "string" },
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

const AttrSection = ({ section }: { section: AttrSectionData }) => {
  const [open, setOpen] = useState(true);
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

const SpanAttributesPanel = ({ span, maxHeight }: SpanAttributesPanelProps) => {
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
      <Flex flexDirection="column" gap={2}>
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
          overflow: "auto",
        }}
      >
        {sections.length === 0 ? (
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            No attributes match your search.
          </Text>
        ) : (
          sections.map((s) => <AttrSection key={s.title} section={s} />)
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
  const selectedSpanId =
    controlledSelected !== undefined ? controlledSelected : uncontrolledSelected;
  const selectSpan = (id: string) => {
    // Toggle off if the same span is clicked again.
    const next = id === selectedSpanId ? null : id;
    if (onSelectSpan) onSelectSpan(next);
    if (controlledSelected === undefined) setUncontrolledSelected(next);
  };
  const roots = useMemo(() => buildTree(spans), [spans]);
  const selectedSpan = useMemo(
    () => spans.find((s) => s.spanId === selectedSpanId) ?? null,
    [spans, selectedSpanId],
  );

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
      <div style={{ flex: "1 1 300px", minWidth: 260 }}>
        <div style={{ maxHeight, overflow: "auto" }}>
          {roots.map((root) => (
            <TraceTreeNode
              key={root.span.spanId}
              node={root}
              selectedSpanId={selectedSpanId}
              onSelectSpan={selectSpan}
              highlight={highlight}
            />
          ))}
        </div>
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 280, maxWidth: 380 }}>
        {selectedSpan ? (
          <SpanAttributesPanel span={selectedSpan} maxHeight={maxHeight} />
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
