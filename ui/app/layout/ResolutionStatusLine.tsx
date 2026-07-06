import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useSegments } from "@dynatrace/strato-components/filters";
import { useResolvedCounts } from "../scope/useResolvedCounts";
import { PageScanTotal } from "../components/ScanDebug";
import { useScanTotal } from "../scope/ScanReportContext";
import { useTweaks } from "../tweaks/TweaksContext";
import { parseBuckets } from "../scope/queries";

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
  const { pageConfig } = useTweaks();
  const { segments } = useSegments();
  // Truncation is surfaced app-wide (not only under the scan-debug toggle): if
  // any query on the page hit its scan-limit budget, the results are partial and
  // the user must know before trusting the numbers.
  const scan = useScanTotal();
  // Buckets (DQL text) and segments (filterSegments request param) live on
  // different layers, so both apply (intersection) — surface a chip so the user
  // knows their bucket tweak isn't being overridden by the active segment.
  const bucketAndSegment =
    pageConfig.bucketFilterEnabled &&
    parseBuckets(pageConfig.bucketFilterText).length > 0 &&
    (segments?.length ?? 0) > 0;
  const { pathname } = useLocation();
  // On Pulse the architecture-map header already carries the service / agent /
  // tool / finding counts, so the strip drops them there to avoid duplication
  // and just anchors scope ("Fleet-wide") + the segments hint + refresh time.
  const onPulse = pathname === "/" || pathname === "/pulse";
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
        <strong>Fleet-wide</strong>
        {!onPulse && (
          <>
            {" "}·{" "}
            <strong>{formatCount(counts.services)}</strong> services with AI spans ·{" "}
            <strong>{formatCount(counts.agents)}</strong> agents ·{" "}
            <strong>{formatCount(counts.tools)}</strong> tools
          </>
        )}
      </Text>
      <Flex flexGrow={1} />
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Scope further with Segments in the toolbar above.
      </Text>
      {bucketAndSegment && (
        <span
          title="Your span-bucket filter and the active segment both apply (intersection). Neither overrides the other."
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 10.5,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid var(--blue)",
            color: "var(--blue)",
            background: "color-mix(in oklab, var(--blue) 12%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          Buckets + segment both active
        </span>
      )}
      {scan?.limitHit && (
        <span
          role="status"
          title="At least one query on this page reached its scan-limit budget, so some results are truncated and may undercount. Raise the scan limit in Tweaks, narrow the timeframe, or add a segment to see complete data."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid var(--amber)",
            color: "var(--amber)",
            background: "color-mix(in oklab, var(--amber) 12%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden>⚠</span> Partial data — scan limit hit
        </span>
      )}
      <PageScanTotal />
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Last refreshed {refreshedLabel}
      </Text>
    </Flex>
  );
};
