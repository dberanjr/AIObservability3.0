import React, { useEffect, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useResolvedCounts } from "../scope/useResolvedCounts";

const formatRelative = (ms: number): string => {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const formatCount = (n: number | null): string => (n == null ? "—" : String(n));

export const ResolutionStatusLine = () => {
  const counts = useResolvedCounts();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refreshedLabel =
    counts.isFetching || counts.lastRefreshed == null
      ? "refreshing..."
      : formatRelative(now - counts.lastRefreshed);

  return (
    <Flex
      alignItems="center"
      gap={12}
      style={{
        padding: "4px 20px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
        flexWrap: "wrap",
      }}
    >
      <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
        <strong>Fleet-wide</strong> ·{" "}
        <strong>{formatCount(counts.services)}</strong> services with AI spans ·{" "}
        <strong>{formatCount(counts.agents)}</strong> agents ·{" "}
        <strong>{formatCount(counts.tools)}</strong> tools
      </Text>
      <Flex flexGrow={1} />
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Scope further with Segments in the toolbar above.
      </Text>
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Last refreshed {refreshedLabel}
      </Text>
    </Flex>
  );
};
