import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { statusColor, type SemanticStatus } from "../../theme/statusColor";
import type { TraceLogLine } from "./useTraceLogs";

const PAGE_SIZE = 10;

// Map a raw log-severity string to a shared semantic status so the color comes
// from the single statusColor vocabulary instead of a local red/amber/blue
// ternary (CONSISTENCY). The level word is rendered beside it, so color stays
// redundant to text — never color-only.
const logSeverity = (status: string): SemanticStatus => {
  const s = status.toUpperCase();
  if (s === "ERROR" || s === "SEVERE" || s === "FATAL") return "critical";
  if (s === "WARN" || s === "WARNING") return "warning";
  if (s === "INFO") return "info";
  return "neutral";
};

const logStatusColor = (status: string): string =>
  statusColor(logSeverity(status));

const logMatches = (log: TraceLogLine, term: string): boolean => {
  if (!term) return true;
  return [log.content, log.source, log.status, log.level, log.spanId, log.namespace]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(term);
};

const LogRow = ({ log }: { log: TraceLogLine }) => {
  const [open, setOpen] = useState(false);
  const time = log.timestampMs
    ? new Date(log.timestampMs).toLocaleTimeString(undefined, {
        hour12: false,
      }) +
      "." +
      String(log.timestampMs % 1000).padStart(3, "0")
    : "—";

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {open ? (
          <ChevronDownIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
        ) : (
          <ChevronRightIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
        )}
        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 11,
            color: "var(--text-3)",
            flex: "0 0 auto",
          }}
        >
          {time}
        </Text>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.03em",
            color: logStatusColor(log.status),
            flex: "0 0 auto",
            width: 52,
          }}
        >
          {log.status.toUpperCase()}
        </span>
        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 11.5,
            color: "var(--text)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {log.content || "(no message)"}
        </Text>
      </button>

      {open && (
        <div style={{ padding: "4px 8px 12px 34px" }}>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              fontFamily: "var(--mono, monospace)",
              fontSize: 11.5,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 240,
              overflow: "auto",
            }}
          >
            {log.content || "(no message)"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr",
              gap: "4px 10px",
              marginTop: 8,
              fontSize: 11,
            }}
          >
            {log.source && (
              <>
                <Text style={{ color: "var(--text-3)" }}>Source</Text>
                <Text style={{ color: "var(--text-2)" }}>{log.source}</Text>
              </>
            )}
            {log.namespace && (
              <>
                <Text style={{ color: "var(--text-3)" }}>Namespace</Text>
                <Text style={{ color: "var(--text-2)" }}>{log.namespace}</Text>
              </>
            )}
            {log.spanId && (
              <>
                <Text style={{ color: "var(--text-3)" }}>Span ID</Text>
                <Text
                  style={{ color: "var(--text-2)", fontFamily: "var(--mono, monospace)" }}
                >
                  {log.spanId}
                </Text>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export interface LogsPanelProps {
  logs: TraceLogLine[];
  isLoading: boolean;
  /** Search term — filters log lines to matches (content / attributes). */
  highlight?: string;
}

export const LogsPanel = ({ logs, isLoading, highlight }: LogsPanelProps) => {
  const [page, setPage] = useState(0);
  const term = (highlight ?? "").trim().toLowerCase();

  const filtered = useMemo(
    () => (term ? logs.filter((l) => logMatches(l, term)) : logs),
    [logs, term],
  );

  // Reset to the first page whenever the result set changes size.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageLogs = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  if (isLoading) {
    return (
      <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 28 }} />
        ))}
      </Flex>
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
          {term
            ? "No logs match your search."
            : "No logs are correlated to this trace."}
        </Text>
      </div>
    );
  }

  return (
    <Flex flexDirection="column" gap={8}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {pageLogs.map((log, i) => (
          <LogRow key={`${log.spanId ?? "?"}-${log.timestampMs}-${i}`} log={log} />
        ))}
      </div>

      <Flex alignItems="center" justifyContent="space-between">
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          {filtered.length} log {filtered.length === 1 ? "line" : "lines"}
          {term ? " (filtered)" : ""} · page {safePage + 1} of {pageCount}
        </Text>
        <Flex gap={6}>
          <Button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
          >
            Previous
          </Button>
          <Button
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
          >
            Next
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
};
