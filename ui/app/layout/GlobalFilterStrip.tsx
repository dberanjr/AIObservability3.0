import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SegmentSelector, useSegments } from "@dynatrace/strato-components/filters";
import { ResetIcon, RefreshIcon } from "@dynatrace/strato-icons";
import { filterSegmentsClient } from "@dynatrace-sdk/client-filter-segment-management";
import { _UseDqlQueryClientContext } from "@dynatrace-sdk/react-hooks";
import { useContext, useEffect, useState } from "react";
import { useScope } from "../scope/ScopeContext";
import { useGlobalFilters } from "../scope/GlobalFilterContext";
import { useTraceScope } from "../scope/TraceScopeContext";
import { ResolutionStatusLine } from "./ResolutionStatusLine";
import { SamplingSegmented } from "./SamplingSegmented";
import { ScanLimitSegmented } from "./ScanLimitSegmented";
import { GlobalAttributeFilter } from "./GlobalAttributeFilter";

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

const LabeledField = ({ label, children }: LabeledFieldProps) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 140 }}>
    <Text
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-3)",
      }}
    >
      {label}
    </Text>
    {children}
  </Flex>
);

/**
 * Secondary, de-emphasised variant of LabeledField for the power-user
 * Grail-cost knobs (Sampling / Scan limit). Same control at full contrast, but
 * a smaller, dimmer label and tighter min-width so it reads as subordinate to
 * the primary Segments / Filters scope controls (IA — Information-10). The
 * control itself is untouched (native <select>, so it stays in the tab order).
 */
const AdvancedField = ({ label, children }: LabeledFieldProps) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 90 }}>
    <Text
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        opacity: 0.75,
      }}
    >
      {label}
    </Text>
    {children}
  </Flex>
);

/**
 * Renders the names of currently-selected segments next to the
 * SegmentSelector trigger so the active scope is visible without opening
 * the dropdown. Strato's `useSegments` only returns segment IDs, so we
 * fetch the full segment list once and use it as a uid → name lookup.
 */
const SelectedSegmentNames = () => {
  const { segments } = useSegments();
  const [nameByUid, setNameByUid] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    filterSegmentsClient
      .getFilterSegments()
      .then((res) => {
        if (cancelled) return;
        const m = new Map<string, string>();
        // The response from getFilterSegments has `filterSegments` on it but
        // shape is loose — read defensively.
        const list = (res as { filterSegments?: Array<{ uid: string; name: string }> })
          .filterSegments ?? (res as unknown as Array<{ uid: string; name: string }>);
        if (Array.isArray(list)) {
          for (const s of list) {
            if (s && typeof s.uid === "string" && typeof s.name === "string") {
              m.set(s.uid, s.name);
            }
          }
        }
        setNameByUid(m);
      })
      .catch(() => {
        // Best-effort — if we can't load the segment list, just show IDs.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (segments.length === 0) return null;
  // Format each selection as "<segment name>: <var values>" when the
  // segment has variables bound, otherwise just "<segment name>". Joins
  // multi-value variable bindings with commas.
  const formatSegment = (s: { id: string; variables?: Array<{ name: string; values: string[] }> }) => {
    const name = nameByUid.get(s.id) ?? s.id;
    const vars = s.variables ?? [];
    const bound = vars
      .flatMap((v) => v.values)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (bound.length === 0) return name;
    return `${name}: ${bound.join(", ")}`;
  };
  const labels = segments.map(formatSegment);
  return (
    <Text
      style={{
        fontSize: 11.5,
        color: "var(--text-2)",
        maxWidth: 360,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={labels.join(", ")}
    >
      {labels.join(" · ")}
    </Text>
  );
};

/**
 * Compact readout of the resolved CROSS-SPAN (agent/tool) trace scope. Renders
 * ONLY when a trace-scoped condition is active — the direct subset
 * (model/service/…) is exact + uncapped and shows no count. Reports how many
 * traces the entity filter matched, a resolving / empty / error state, and an
 * "approximate" note when the match set hit SAFE_TRACE_CAP.
 */
const TraceScopeIndicator = () => {
  const { hasScopeConditions, isResolving, isTruncated, matchedCount, cap, error } =
    useTraceScope();
  if (!hasScopeConditions) return null;

  let text: string;
  let color = "var(--text-2)";
  if (error) {
    text = "entity filter failed — narrow it";
    color = "var(--red, #c4314b)";
  } else if (isResolving) {
    text = "resolving matching traces…";
  } else if (matchedCount === 0) {
    text = "no matching traces";
    color = "var(--amber, #ab6400)";
  } else if (isTruncated) {
    text = `approximate · first ${cap.toLocaleString()} traces`;
    color = "var(--amber, #ab6400)";
  } else {
    const n = matchedCount.toLocaleString();
    text = `scoped to ${n} trace${matchedCount === 1 ? "" : "s"}`;
  }

  return (
    <Text
      style={{ fontSize: 11, color, whiteSpace: "nowrap" }}
      title={
        isTruncated
          ? `Too many traces match this agent/tool — only the first ${cap.toLocaleString()} are applied. Narrow the filter or shorten the timeframe.`
          : undefined
      }
    >
      {text}
    </Text>
  );
};

export const GlobalFilterStrip = () => {
  const { reset } = useScope();
  const { clearAll, runResetHandlers } = useGlobalFilters();
  // useDql runs all page queries on this client (the SDK's default client,
  // exposed via _UseDqlQueryClientContext — the app installs no QueryClientProvider
  // of its own). Invalidating it forces every active query to refetch.
  const queryClient = useContext(_UseDqlQueryClientContext);
  const [isReloading, setIsReloading] = useState(false);

  const resetAll = () => {
    reset();
    clearAll();
    // Clear page-local filters (e.g. Explorer's URL-param sidebar facets).
    runResetHandlers();
  };

  const reload = () => {
    setIsReloading(true);
    void queryClient
      .invalidateQueries()
      .finally(() => setIsReloading(false));
  };

  return (
    <Flex
      flexDirection="column"
      style={{
        background:
          "linear-gradient(90deg, rgba(28, 91, 229, 0.04), rgba(178, 59, 228, 0.02))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Flex
        gap={12}
        alignItems="flex-end"
        style={{
          padding: "8px 20px",
          minHeight: 48,
          flexWrap: "wrap",
        }}
      >
        {/* Primary scope controls — Segments + Filters carry full weight and
            sit together on the left as the two everyday knobs. */}
        <LabeledField label="Segments">
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <SegmentSelector variant="compact" />
            <SelectedSegmentNames />
          </Flex>
        </LabeledField>

        <LabeledField label="Filters">
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            {/* Active conditions render as removable pills inside
                GlobalAttributeFilter. The direct subset (model/service/…) is
                exact + uncapped, so no count is shown for it. The cross-span
                entity subset (agent/tool) is resolved to trace.ids — the
                TraceScopeIndicator shows that count (and an approximate note
                when the match set hits the cap). */}
            <GlobalAttributeFilter />
            <TraceScopeIndicator />
          </Flex>
        </LabeledField>

        <Flex flexGrow={1} style={{ minWidth: 0 }} />

        {/* Secondary / advanced Grail-cost knobs — demoted (smaller, dimmer
            labels, behind a divider) so they no longer sit at equal weight with
            the primary scope controls (IA — Information-10). Most users never
            touch Sampling / Scan limit. */}
        <Flex
          alignItems="flex-end"
          gap={12}
          style={{
            paddingLeft: 16,
            borderLeft: "1px solid var(--border)",
          }}
        >
          <AdvancedField label="Sampling">
            <SamplingSegmented />
          </AdvancedField>

          <AdvancedField label="Scan limit">
            <ScanLimitSegmented />
          </AdvancedField>
        </Flex>

        <Flex gap={8} alignItems="center">
          <Button
            variant="default"
            onClick={reload}
            disabled={isReloading}
            aria-label="Reload data"
          >
            <Button.Prefix>
              <RefreshIcon />
            </Button.Prefix>
            Reload
          </Button>
          {/* Always enabled: page-local filters (e.g. Explorer's URL-param
              sidebar) can be active even when scope is default and no global
              attribute filter is set, and they aren't reflected in hasFilters. */}
          <Button
            variant="default"
            onClick={resetAll}
            aria-label="Reset filters"
          >
            <Button.Prefix>
              <ResetIcon />
            </Button.Prefix>
            Reset
          </Button>
        </Flex>
      </Flex>
      <ResolutionStatusLine />
    </Flex>
  );
};
