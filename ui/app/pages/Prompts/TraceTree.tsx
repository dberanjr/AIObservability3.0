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

const TraceTreeNode = ({
  node,
  selectedSpanId,
  onSelectSpan,
}: {
  node: TraceNode;
  selectedSpanId: string | null;
  onSelectSpan: (spanId: string) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.span.spanId === selectedSpanId;
  const color = getSpanColor(node.span);

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
          background: isSelected ? "color-mix(in oklab, var(--blue) 12%, transparent)" : undefined,
          borderLeft: isSelected ? "2px solid var(--blue)" : "2px solid transparent",
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SpanAttributesPanelProps {
  span: TraceSpan;
}

const SpanAttributesPanel = ({ span }: SpanAttributesPanelProps) => (
  <div style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 1fr",
        gap: 12,
        fontSize: 11.5,
      }}
    >
      <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Span ID</Text>
      <Text style={{ fontFamily: "var(--mono, monospace)", color: "var(--text-2)" }}>
        {span.spanId}
      </Text>

      {span.parentSpanId && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Parent</Text>
          <Text style={{ fontFamily: "var(--mono, monospace)", color: "var(--text-2)" }}>
            {span.parentSpanId}
          </Text>
        </>
      )}

      <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Duration</Text>
      <Text>{fmtMs(span.durationMs)}</Text>

      {span.provider && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Provider</Text>
          <Text>{span.provider}</Text>
        </>
      )}

      {span.model && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Model</Text>
          <Text>{span.model}</Text>
        </>
      )}

      {span.operation && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Operation</Text>
          <Text>{span.operation}</Text>
        </>
      )}

      {span.agentName && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Agent</Text>
          <Text>{span.agentName}</Text>
        </>
      )}

      {span.toolName && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Tool</Text>
          <Text>{span.toolName}</Text>
        </>
      )}

      {(span.inTokens > 0 || span.outTokens > 0) && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Tokens</Text>
          <Text>
            in: {fmtTokens(span.inTokens)} / out: {fmtTokens(span.outTokens)}
          </Text>
        </>
      )}

      {span.workflow && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--text-3)" }}>Workflow</Text>
          <Text>{span.workflow}</Text>
        </>
      )}

      {span.exceptionType && (
        <>
          <Text style={{ fontWeight: 600, color: "var(--red)" }}>Error</Text>
          <Text style={{ color: "var(--text-2)" }}>
            {span.exceptionType}
            {span.exceptionMsg && `: ${span.exceptionMsg}`}
          </Text>
        </>
      )}
    </div>
  </div>
);

export interface TraceTreeProps {
  spans: TraceSpan[];
  isLoading: boolean;
}

export const TraceTree = ({ spans, isLoading }: TraceTreeProps) => {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
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
    <div>
      <div style={{ maxHeight: 300, overflow: "auto", marginBottom: 12 }}>
        {roots.map((root) => (
          <TraceTreeNode
            key={root.span.spanId}
            node={root}
            selectedSpanId={selectedSpanId}
            onSelectSpan={setSelectedSpanId}
          />
        ))}
      </div>

      {selectedSpan && <SpanAttributesPanel span={selectedSpan} />}
    </div>
  );
};
