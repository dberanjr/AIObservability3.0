import React from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { CopyIcon } from "@dynatrace/strato-icons";

export interface DetectorSuggestion {
  name: string;
  type: "metric-anomaly" | "static-threshold";
  signal: string;
  filter: string;
  sensitivity: string;
  baselineHint: string;
  dql: string;
}

const DEFAULT_SUGGESTIONS: DetectorSuggestion[] = [
  {
    name: "Agent runaway latency",
    type: "metric-anomaly",
    signal: "Agent P90 latency",
    filter: "gen_ai.agent.name is set",
    sensitivity: "Medium · learn 7d",
    baselineHint: "Learned per-agent baseline · alerts on 3× deviation",
    dql: `timeseries p90 = percentile(duration, 90), interval: 5m, by: { agent = gen_ai.agent.name }
| filter isNotNull(agent)`,
  },
  {
    name: "Token cost spike",
    type: "metric-anomaly",
    signal: "Tokens / hour per service",
    filter: "AppCI scope · gen_ai.provider.name is set",
    sensitivity: "High · learn 7d",
    baselineHint: "Per-service hourly token baseline · 3× rolling 6h average",
    dql: `timeseries tokens = sum(toLong(gen_ai.usage.input_tokens) + toLong(gen_ai.usage.output_tokens)),
    interval: 1h, by: { service = entityName(dt.entity.service) }`,
  },
  {
    name: "Logical error surge",
    type: "static-threshold",
    signal: "Count of HTTP-200 logical failures",
    filter: "gen_ai.error.type or guardrail action present",
    sensitivity: "Static · > 10 in 15 min",
    baselineHint: "Hard threshold · use for guardrail tripwires",
    dql: `fetch spans, from: now()-15m
| filter isNotNull(gen_ai.error.type) or isNotNull(gen_ai.guardrail.action)
| summarize count()`,
  },
  {
    name: "Within-trace token growth",
    type: "metric-anomaly",
    signal: "Billable tokens per LLM call within a trace",
    filter: "gen_ai.request.model is set · ordered by time within trace.id",
    sensitivity: "Medium · learn 7d",
    baselineHint: "Last call >= 2.5× the first across 3+ calls (cache reads excluded)",
    dql: `fetch spans
| filter isNotNull(gen_ai.request.model)
| sort timestamp asc
| summarize ins = collectArray(toLong(gen_ai.usage.input_tokens)), n = count(), by: { trace = trace.id }
| filter n >= 3`,
  },
  {
    name: "Model fallback / mismatch",
    type: "static-threshold",
    signal: "request.model != response.model (normalized)",
    filter: "gen_ai.request.model and gen_ai.response.model set",
    sensitivity: "Static · > 15% of calls",
    baselineHint: "Normalize version suffixes before comparing",
    dql: `fetch spans
| filter isNotNull(gen_ai.request.model) and isNotNull(gen_ai.response.model)
| summarize requests = count(), by: { req = gen_ai.request.model, resp = gen_ai.response.model }`,
  },
  {
    name: "Context-window truncation",
    type: "static-threshold",
    signal: "finish_reason max_tokens / length",
    filter: "gen_ai.response.finish_reasons set",
    sensitivity: "Static · > 2% of generations",
    baselineHint: "Hard threshold on truncated share",
    dql: `fetch spans
| filter isNotNull(gen_ai.request.model)
| summarize total = count(), truncated = countIf(contains(lower(toString(gen_ai.response.finish_reasons)), "max_tokens") or contains(lower(toString(gen_ai.response.finish_reasons)), "length"))`,
  },
  {
    name: "Provider rate-limit / backoff",
    type: "static-threshold",
    signal: "429 / throttling at the LLM boundary",
    filter: "http.response.status_code == 429 or rate-limit error code",
    sensitivity: "Static · any sustained 429s",
    baselineHint: "Watch for exponential-backoff retry signatures",
    dql: `fetch spans, from: now()-15m
| filter toLong(coalesce(http.response.status_code, 0)) == 429
| summarize count()`,
  },
  {
    name: "TTFT degradation",
    type: "metric-anomaly",
    signal: "Streaming time-to-first-token",
    filter: "gen_ai.response.ttft set (capability-gated)",
    sensitivity: "Medium · learn 7d",
    baselineHint: "Latest hour vs rolling avg · alerts on 1.5× regression",
    dql: `timeseries ttft = avg(toDouble(coalesce(gen_ai.response.ttft, gen_ai.usage.time_to_first_token, gen_ai.response.time_to_first_chunk))), interval: 1h`,
  },
  {
    name: "Tool-output → token spike (I.2)",
    type: "metric-anomaly",
    signal: "Next LLM call's billable tokens after a tool call",
    filter: "tool span followed by an LLM call in the same trace",
    sensitivity: "Medium · learn 7d",
    baselineHint:
      "Attributes a context-bloat jump to a specific tool. Needs span-sequence correlation — lift into a Notebook workflow.",
    dql: `fetch spans
| filter (traceloop.span.kind == "tool" or span.name == "mcp.server") or isNotNull(gen_ai.request.model)
| sort timestamp asc`,
  },
];

const SuggestionCard = ({ s }: { s: DetectorSuggestion }) => {
  const onCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(s.dql);
    }
  };
  return (
    <Surface elevation="raised" padding={12}>
      <Flex flexDirection="column" gap={8}>
        <Flex alignItems="center" justifyContent="space-between" gap={8}>
          <Flex flexDirection="column" gap={2}>
            <Text style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</Text>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {s.signal}
            </Text>
          </Flex>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: "var(--intel-soft)",
              color: "var(--purple)",
            }}
          >
            {s.type}
          </span>
        </Flex>
        <Flex flexDirection="column" gap={2}>
          <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
            <strong>Filter:</strong> {s.filter}
          </Text>
          <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
            <strong>Sensitivity:</strong> {s.sensitivity}
          </Text>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {s.baselineHint}
          </Text>
        </Flex>
        <Flex flexDirection="column" gap={4}>
          <pre
            style={{
              margin: 0,
              padding: 8,
              borderRadius: 6,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              fontSize: 11,
              fontFamily: "var(--mono, monospace)",
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              overflowX: "auto",
            }}
          >
            {s.dql}
          </pre>
          <Button variant="default" onClick={onCopy}>
            <Button.Prefix>
              <CopyIcon />
            </Button.Prefix>
            Copy DQL
          </Button>
        </Flex>
      </Flex>
    </Surface>
  );
};

export interface IntelligenceDetectorDrawerProps {
  show: boolean;
  onDismiss: () => void;
  suggestions?: DetectorSuggestion[];
}

export const IntelligenceDetectorDrawer = ({
  show,
  onDismiss,
  suggestions = DEFAULT_SUGGESTIONS,
}: IntelligenceDetectorDrawerProps) => (
  <Sheet
    show={show}
    onDismiss={onDismiss}
    title="Setup Intelligence Anomaly Detector"
    aria-label="Anomaly detector setup"
  >
    <Flex
      flexDirection="column"
      gap={16}
      style={{ width: 520, maxWidth: "100%" }}
    >
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        Three pre-configured detectors that you can lift into Dynatrace
        Intelligence Analyzers. Copy the DQL or follow the footer links to wire
        them up in-platform.
      </Text>

      <Flex flexDirection="column" gap={8}>
        <Heading level={3} style={{ fontSize: 13, fontWeight: 600 }}>
          Suggested analyzers
        </Heading>
        {suggestions.map((s) => (
          <SuggestionCard key={s.name} s={s} />
        ))}
      </Flex>

      <Flex flexDirection="column" gap={6}>
        <Button
          as="a"
          href="/ui/intelligence-analyzers"
          variant="default"
        >
          Open Intelligence Analyzers in Dynatrace
        </Button>
        <Button
          as="a"
          href="https://docs.dynatrace.com/docs/observe/davis-ai/intelligence-analyzers"
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
        >
          Intelligence Analyzer documentation
        </Button>
      </Flex>
    </Flex>
  </Sheet>
);
