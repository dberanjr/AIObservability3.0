import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon, ConnectorIcon } from "@dynatrace/strato-icons";
import { fmtCount, fmtPercent } from "../../../data/format";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { ErrorBanner } from "../../../components/ErrorState";
import { EmptyState } from "../../../components/EmptyState";
import { useAwsTelemetryAudit, type AwsSectionResult, type AwsFieldResult } from "./useAwsTelemetryAudit";
import { VERDICT_COLOR, coverageRampColor } from "../coverage";

const HeroStat = ({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) => (
  <Flex flexDirection="column" gap={4} style={{ minWidth: 0 }}>
    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
      {label}
    </Text>
    <Text style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: color ?? "var(--text)" }}>
      {value}
    </Text>
    {sub && <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.2 }}>{sub}</Text>}
  </Flex>
);

const VerdictDot = ({ verdict }: { verdict: AwsFieldResult["verdict"] }) => (
  <span
    role="img"
    aria-label={verdict}
    title={verdict}
    style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: VERDICT_COLOR[verdict],
      flex: "0 0 auto",
    }}
  />
);

const RequiredBadge = ({ required }: { required: boolean }) => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: required ? "var(--text-3)" : "var(--text-4)",
      border: `1px solid ${required ? "var(--border)" : "var(--border)"}`,
      borderRadius: 4,
      padding: "0 4px",
      flex: "0 0 auto",
    }}
  >
    {required ? "Required" : "Optional"}
  </span>
);

const FieldRow = ({ f }: { f: AwsFieldResult }) => (
  <Flex alignItems="center" gap={8} style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
    <VerdictDot verdict={f.verdict} />
    <Flex flexDirection="column" gap={0} style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", fontFamily: "monospace" }}>{f.field.name}</Text>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>{f.field.what}</Text>
    </Flex>
    <RequiredBadge required={f.field.required} />
    <Text style={{ fontSize: 10.5, color: "var(--text-3)", minWidth: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
      {f.field.required || f.present ? fmtCount(f.count) : "—"}
    </Text>
  </Flex>
);

const SectionBlock = ({ result }: { result: AwsSectionResult }) => {
  const [open, setOpen] = useState(true);
  const color = coverageRampColor(result.presentCount, result.totalCount);
  return (
    <Surface elevation="raised" padding={12}>
      <Flex flexDirection="column" gap={8}>
        <Flex
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          style={{ cursor: "pointer" }}
          onClick={() => setOpen((v) => !v)}
        >
          <Flex alignItems="center" gap={6}>
            {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            <Heading level={3} style={{ fontSize: 13, fontWeight: 600 }}>
              {result.section.title}
            </Heading>
          </Flex>
          <Text style={{ fontSize: 11.5, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>
            {result.presentCount}/{result.totalCount}
          </Text>
        </Flex>
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{result.section.blurb}</Text>
        {result.isLoading ? (
          <Skeleton style={{ height: 60, borderRadius: 6 }} />
        ) : result.error ? (
          <ErrorBanner error={result.error} />
        ) : result.noData ? (
          <Text style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
            {result.section.kind === "metrics"
              ? "No datapoints found in the current timeframe."
              : "No rows found in the current timeframe."}
          </Text>
        ) : open ? (
          <Flex flexDirection="column" gap={0}>
            {result.fields.map((f) => (
              <FieldRow key={f.field.path} f={f} />
            ))}
          </Flex>
        ) : null}
      </Flex>
    </Surface>
  );
};

/**
 * AWS Bedrock raw-telemetry audit — a self-contained block appended to the
 * Telemetry page, below the OTel span-attribute groups. Deliberately kept
 * visually and architecturally separate from the span audit above it (own
 * mini-hero, own section cards) rather than blended into one coverage %:
 * these are two different tenants' worth of instrumentation (OTel GenAI spans
 * vs. raw AWS CloudWatch/CloudTrail), and averaging them together would just
 * produce a meaningless number for a tenant that only has one or the other.
 */
export const AwsTelemetrySection = () => {
  const audit = useAwsTelemetryAudit();

  return (
    <Flex flexDirection="column" gap={16}>
      <Flex flexDirection="column" gap={4}>
        <Flex alignItems="center" gap={8}>
          <ConnectorIcon size={18} style={{ color: "var(--blue)" }} />
          <Heading level={2} style={{ fontSize: 16, fontWeight: 600 }}>
            AWS Bedrock Telemetry
          </Heading>
        </Flex>
        <Text style={{ fontSize: 12, color: "var(--text-2)", maxWidth: 900, lineHeight: 1.5 }}>
          A separate coverage audit for AWS Bedrock's own telemetry — CloudWatch model-invocation
          logs, <code>cloud.aws.bedrock*</code> metrics, and Bedrock CloudTrail events — which power
          the AWS Bedrock page and aren't OTel span attributes. Tenant-wide: honors the selected
          timeframe only (not Segments, global filters, or Account/Model scope), so a gap here is
          never masked by a narrow filter.
        </Text>
      </Flex>

      {audit.isEmpty && !audit.error ? (
        <EmptyState
          bare
          cause="no-instrumentation"
          title="No AWS Bedrock telemetry found"
          description="No ModelInvocationLog activity, cloud.aws.bedrock.* metrics, or Bedrock CloudTrail events were found in the current timeframe."
        />
      ) : (
        <>
          <Surface elevation="raised" padding={16}>
            <Flex gap={24} style={{ flexWrap: "wrap" }}>
              <HeroStat
                label="Required coverage"
                value={audit.isLoading ? "…" : fmtPercent(audit.overview.requiredCoveragePct)}
                color={coverageRampColor(audit.overview.requiredCoveragePct, 100)}
              />
              <HeroStat
                label="Fields tracked"
                value={audit.isLoading ? "…" : `${audit.overview.fieldsPresent}/${audit.overview.fieldsTotal}`}
                sub="present / total"
              />
              <HeroStat
                label="Sections fully covered"
                value={audit.isLoading ? "…" : `${audit.overview.sectionsFullyCovered}/${audit.sections.length}`}
              />
              <HeroStat
                label="Sparse fields"
                value={audit.isLoading ? "…" : fmtCount(audit.overview.sparseTotal)}
                sub={
                  <InfoTooltip text="Present on <1% of the section's rows — technically seen, but too rare to treat as real coverage." size={11} />
                }
              />
            </Flex>
          </Surface>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
            {audit.sections.map((s) => (
              <SectionBlock key={s.section.id} result={s} />
            ))}
          </div>
        </>
      )}
    </Flex>
  );
};
