import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { SegmentSelector, useSegments } from "@dynatrace/strato-components/filters";
import { ResetIcon } from "@dynatrace/strato-icons";
import { filterSegmentsClient } from "@dynatrace-sdk/client-filter-segment-management";
import { useEffect, useState } from "react";
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
 * Compact readout of the resolved global-filter trace scope: how many traces
 * the active filter matched, whether the result is approximate (capped), and a
 * resolving / empty / error state. Renders nothing when no filter is active.
 */
const TraceScopeIndicator = () => {
  const { isActive, isLoading, isTruncated, matchedCount, cap, error } =
    useTraceScope();
  if (!isActive) return null;

  let text: string;
  let color = "var(--text-2)";
  if (error) {
    text = "filter failed — narrow it or lower the trace cap";
    color = "var(--red, #c4314b)";
  } else if (isLoading) {
    text = "resolving matching traces…";
  } else if (matchedCount === 0) {
    text = "no matching traces";
    color = "var(--amber, #ab6400)";
  } else {
    const n = matchedCount.toLocaleString();
    text = isTruncated
      ? `approximate · first ${n} of ${cap.toLocaleString()}+ traces`
      : `${n} matching trace${matchedCount === 1 ? "" : "s"}`;
    if (isTruncated) color = "var(--amber, #ab6400)";
  }

  return (
    <Text
      style={{ fontSize: 11, color, whiteSpace: "nowrap" }}
      title={
        isTruncated
          ? "Too many traces match — only the first N are applied. Raise the cap in Tweaks › Global filter, or narrow the filter."
          : undefined
      }
    >
      {text}
    </Text>
  );
};

export const GlobalFilterStrip = () => {
  const { scope, reset } = useScope();
  const { hasFilters, clearAll } = useGlobalFilters();

  const isDefaultScope =
    scope.timeframe.from === "now()-24h" && !scope.timeframe.to;

  const resetAll = () => {
    reset();
    clearAll();
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
        <LabeledField label="Segments">
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <SegmentSelector variant="compact" />
            <SelectedSegmentNames />
          </Flex>
        </LabeledField>

        <LabeledField label="Sampling">
          <SamplingSegmented />
        </LabeledField>

        <LabeledField label="Scan limit">
          <ScanLimitSegmented />
        </LabeledField>

        <LabeledField label="Filters">
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <GlobalAttributeFilter />
            <TraceScopeIndicator />
          </Flex>
        </LabeledField>

        <Flex flexGrow={1} style={{ minWidth: 0 }} />

        <Button
          variant="default"
          onClick={resetAll}
          disabled={isDefaultScope && !hasFilters}
          aria-label="Reset filters"
        >
          <Button.Prefix>
            <ResetIcon />
          </Button.Prefix>
          Reset
        </Button>
      </Flex>
      <ResolutionStatusLine />
    </Flex>
  );
};
