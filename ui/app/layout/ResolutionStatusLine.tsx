import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useSegments } from "@dynatrace/strato-components/filters";
import { useResolvedCounts } from "../scope/useResolvedCounts";
import { PageScanReadout, PageScanTotal } from "../components/ScanDebug";
import { SamplingBadge } from "../components/SamplingBadge";
import { useScanTotal } from "../scope/ScanReportContext";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../scope/ScanLimitContext";
import { useTweaks } from "../tweaks/TweaksContext";
import { parseBuckets } from "../scope/queries";
import { fmtSecs1 } from "../data/format";

// A refresh older than this reads as stale — the status timestamp turns amber
// so cached, aging data doesn't masquerade as fresh (scan-8).
const STALE_MS = 5 * 60_000;
// A slowest-query time at/above this is called out in amber so a heavy refresh
// is visible rather than silently slow (scan-8).
const SLOW_QUERY_MS = 5000;

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

// Shared amber "partial data" chip styling — used by both the interactive
// (button) and the ceiling (static) truncation indicators (scan-4).
const TRUNC_CHIP_STYLE: React.CSSProperties = {
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
};

export const ResolutionStatusLine = () => {
  const counts = useResolvedCounts();
  const { pageConfig } = useTweaks();
  const { segments } = useSegments();
  // Truncation is surfaced app-wide (not only under the scan-debug toggle): if
  // any query on the page hit its scan-limit budget, the results are partial and
  // the user must know before trusting the numbers.
  const scan = useScanTotal();
  // scan-4: the truncation chip is a real control that raises the scan limit —
  // wired to the SAME setter the toolbar ScanLimitSegmented selector uses — so a
  // "partial data" warning is one click from being fixed. Offer the next tier up
  // (unless already at the ceiling, where the fix is a narrower scope instead).
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const scanLimitIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScanGb =
    scanLimitIdx >= 0 && scanLimitIdx < SCAN_LIMITS_GB.length - 1
      ? SCAN_LIMITS_GB[scanLimitIdx + 1]
      : null;
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

  const refreshing = counts.isFetching || counts.lastRefreshed == null;
  // scan-8: age "Last refreshed" to the OLDEST contributing query on the page
  // (the stalest of the fleet-count roll-up and every per-tile scan timestamp),
  // not just useResolvedCounts.lastRefreshed — otherwise one aging tile hides
  // behind a freshly-recomputed aggregate.
  const oldestQueryTs = scan?.oldestRefreshedAt ?? null;
  const baseRefreshed = (() => {
    const ts = [counts.lastRefreshed, oldestQueryTs].filter(
      (t): t is number => t != null,
    );
    return ts.length > 0 ? Math.min(...ts) : null;
  })();
  const refreshAge = baseRefreshed == null ? null : now - baseRefreshed;
  const refreshedLabel = refreshing
    ? "refreshing..."
    : formatRelative(refreshAge ?? 0);
  // Hover breakdown naming the stalest tile behind the aged timestamp (scan-8).
  const oldestAge = oldestQueryTs == null ? null : now - oldestQueryTs;
  const oldestBreakdown =
    oldestAge == null
      ? ""
      : ` Oldest ${
          scan?.oldestGroup ? `tile "${scan.oldestGroup}"` : "query"
        }: ${formatRelative(oldestAge)}.`;
  // Escalate the freshness indicator once data ages past the staleness cutoff
  // (scan-8): the label turns amber so a "refreshed 8m ago" that's actually
  // serving stale cache reads as a caveat, not decoration.
  const stale = !refreshing && refreshAge != null && refreshAge > STALE_MS;
  // Surface the slowest query behind the current page so a heavy refresh is
  // visible; amber once it crosses the slow threshold.
  const slowestMs = scan?.executionMs ?? 0;
  const slow = slowestMs >= SLOW_QUERY_MS;

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
      {/* scan-3: prominent, always-visible disclosure that the page's numbers
          are extrapolated from a sample (renders nothing when sampling is off). */}
      <SamplingBadge variant="full" />
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
      {scan?.limitHit &&
        (nextScanGb != null ? (
          // scan-4: a real, keyboard-focusable control. `all: unset` strips the
          // native button chrome (the global `button:focus-visible` rule in
          // tokens.ts still paints the keyboard ring); click raises the scan
          // limit via the shared setter.
          <button
            type="button"
            onClick={() => setScanLimit(nextScanGb)}
            aria-label={`Partial data — a query hit its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget. Raise the scan limit to ${SCAN_LIMIT_LABELS[nextScanGb]} to load complete data.`}
            title={`At least one query on this page reached its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget, so some results are truncated and may undercount. Click to raise the scan limit to ${SCAN_LIMIT_LABELS[nextScanGb]} (or narrow the timeframe / add a segment).`}
            style={{ all: "unset", ...TRUNC_CHIP_STYLE, cursor: "pointer" }}
          >
            <span aria-hidden>⚠</span> Partial data — scan limit hit
            <span aria-hidden style={{ textDecoration: "underline" }}>
              {" · "}Raise to {SCAN_LIMIT_LABELS[nextScanGb]}
            </span>
          </button>
        ) : (
          <span
            role="status"
            title={`At least one query on this page reached its ${SCAN_LIMIT_LABELS[scanLimitGb]} scan-limit budget (already the maximum), so some results are truncated. Narrow the timeframe or add a segment to see complete data.`}
            style={TRUNC_CHIP_STYLE}
          >
            <span aria-hidden>⚠</span> Partial data — scan limit hit
          </span>
        ))}
      {/* scan-4/5/7: always-on, calm scan-cost + budget readout for everyone,
          independent of the scan-debug toggle. */}
      <PageScanReadout />
      {/* Verbose engineer diagnostic — still gated on the scanStats tweak (tiles mode). */}
      <PageScanTotal />
      <Text
        style={{
          fontSize: 11,
          color: stale ? "var(--amber)" : "var(--text-3)",
          fontWeight: stale ? 600 : undefined,
          whiteSpace: "nowrap",
        }}
        title={
          (stale
            ? "This page hasn't refreshed in over 5 minutes — some tiles may be serving cached data. Change the timeframe or narrow scope to refresh."
            : "When the page last refreshed, aged to the oldest tile on the page. The slowest query on this page is shown alongside.") +
          oldestBreakdown
        }
      >
        Last refreshed {refreshedLabel}
        {slowestMs > 0 && (
          <>
            {" · "}
            <span style={{ color: slow ? "var(--amber)" : "inherit" }}>
              slowest query {fmtSecs1(slowestMs)}
            </span>
          </>
        )}
      </Text>
    </Flex>
  );
};
