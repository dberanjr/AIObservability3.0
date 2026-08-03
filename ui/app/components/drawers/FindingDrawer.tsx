import React from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  CriticalIcon,
  WarningIcon,
  CheckmarkIcon,
} from "@dynatrace/strato-icons";
import {
  DEFAULT_FINDING_INTENTS,
  type Finding,
  type FindingIntent,
  type FindingSeverity,
} from "./types";
import { dispatchIntent } from "../../lib/intents";
import { useTabNav } from "../../lib/nav";
import { encodePromptsFilter, promptsFilterForFinding } from "../../pages/Prompts/findingFilter";
import { fmtCount, fmtMs } from "../../data/format";
import { Spark } from "../../pages/Pulse/archMap/Spark";
import {
  usePulseSeries,
  seriesForFinding,
  seriesLabelForFinding,
} from "../../pages/Pulse/archMap/usePulseSeries";

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
};

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const SeverityIcon = ({ severity }: { severity: FindingSeverity }) => {
  switch (severity) {
    case "critical":
      return <CriticalIcon size={16} style={{ color: SEVERITY_COLOR.critical }} />;
    case "warning":
      return <WarningIcon size={16} style={{ color: SEVERITY_COLOR.warning }} />;
    default:
      return <CheckmarkIcon size={16} style={{ color: SEVERITY_COLOR.info }} />;
  }
};

const SeverityPill = ({ severity }: { severity: FindingSeverity }) => (
  <Flex
    alignItems="center"
    gap={6}
    style={{
      padding: "4px 10px",
      borderRadius: 999,
      background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 14%, transparent)`,
      border: `1px solid color-mix(in oklab, ${SEVERITY_COLOR[severity]} 40%, transparent)`,
      alignSelf: "flex-start",
    }}
  >
    <SeverityIcon severity={severity} />
    <Text
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: SEVERITY_COLOR[severity],
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {SEVERITY_LABEL[severity]}
    </Text>
  </Flex>
);

const formatTime = (ms?: number): string | null => {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return null;
  }
};

export interface FindingDrawerProps {
  finding: Finding | null;
  onDismiss: () => void;
  /**
   * `showExample` (default false, mirrors useGuardrails.ts) renders the
   * drawer's own trend sparkline (`usePulseSeries`) from its Demo Mode
   * fixture instead of scanning Grail — pass the owning page's `showExample`
   * flag so a finding card opened while Demo Mode is active doesn't reveal
   * a live (or empty) chart underneath canned findings. Every other caller
   * of this shared drawer (Pulse, Explorer, Models, Bedrock) omits it, so
   * their behavior is unchanged.
   */
  showExample?: boolean;
}

/**
 * Build the click handler for a finding intent. If the caller pre-set
 * `onClick`, use it verbatim. Otherwise, when `intent` is set, dispatch the
 * platform intent with the current finding's entity as context.
 */
const handlerFor = (
  intent: FindingIntent,
  finding: Finding,
): (() => void) | undefined => {
  if (intent.onClick) return intent.onClick;
  if (intent.intent) {
    return () =>
      dispatchIntent(intent.intent!, {
        entity: finding.entity,
        startMs: finding.timestampMs,
      });
  }
  return undefined;
};

export const FindingDrawer = ({
  finding,
  onDismiss,
  showExample = false,
}: FindingDrawerProps) => {
  const intents = finding?.intents ?? DEFAULT_FINDING_INTENTS;
  const timestamp = formatTime(finding?.timestampMs);
  const goToTab = useTabNav();
  // Per-finding metric series (only scanned while a finding is open) so the
  // drawer shows WHEN the condition spiked over the window.
  const series = usePulseSeries(Boolean(finding), showExample);
  const anomaly: (Finding & { type?: string }) | null = finding;
  const findingSeries = anomaly ? seriesForFinding(anomaly, series) : undefined;
  const isLatency = anomaly?.type === "latency-spike" || anomaly?.type === "ttft-degradation";

  const openInPrompts = () => {
    if (!finding) return;
    onDismiss();
    // A finding may carry an explicit filter (Model findings scope to their
    // model[s]); otherwise fall back to the anomaly-type mapping.
    const filter = finding.promptsFilter ?? promptsFilterForFinding(finding);
    goToTab("/prompts", {
      focus: "llm",
      params: encodePromptsFilter(filter),
    });
  };

  return (
    <Sheet
      show={Boolean(finding)}
      title={finding?.category ?? ""}
      onDismiss={onDismiss}
      aria-label="Finding details"
    >
      {finding && (
        <Flex
          flexDirection="column"
          gap={16}
          style={{ width: 480, maxWidth: "100%" }}
        >
          <SeverityPill severity={finding.severity} />

          <Flex flexDirection="column" gap={4}>
            <Text
              style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 13,
                color: "var(--text-2)",
              }}
            >
              {finding.entity}
            </Text>
            <Heading
              level={2}
              style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
            >
              {finding.metric}
            </Heading>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              {finding.context}
            </Text>
          </Flex>

          {/* When the condition occurred — the relevant metric over the window. */}
          {findingSeries && findingSeries.length > 1 ? (
            <Flex flexDirection="column" gap={4}>
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {seriesLabelForFinding(anomaly ?? {})}
                {series.intervalLabel ? ` · ${series.intervalLabel}` : ""}
              </Text>
              <Spark
                data={findingSeries}
                color={SEVERITY_COLOR[finding.severity]}
                width={440}
                height={60}
                fluid
                labels={series.labels}
                format={isLatency ? fmtMs : fmtCount}
              />
            </Flex>
          ) : (
            <div
              aria-hidden
              style={{
                height: 60,
                borderRadius: 6,
                background: "var(--surface-2)",
                border: "1px dashed var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {series.isLoading ? "Loading trend…" : "No time series for this finding"}
              </Text>
            </div>
          )}

          {finding.detail && (
            <Text style={{ fontSize: 13, color: "var(--text-2)" }}>
              {finding.detail}
            </Text>
          )}

          <Flex flexDirection="column" gap={8}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Continue the investigation
            </Text>
            <Flex flexDirection="column" gap={6}>
              <Button
                variant="emphasized"
                color="primary"
                onClick={openInPrompts}
                title="Open the Prompts stream filtered to the spans that contributed to this finding"
              >
                View contributing prompts
              </Button>
              {intents.map((intent) => {
                const onClick = handlerFor(intent, finding);
                return (
                  <Button
                    key={intent.label}
                    variant="default"
                    onClick={onClick}
                    disabled={!onClick}
                    title={intent.hint}
                  >
                    {intent.label}
                  </Button>
                );
              })}
            </Flex>
          </Flex>

          {timestamp && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Detected {timestamp}
            </Text>
          )}
        </Flex>
      )}
    </Sheet>
  );
};
