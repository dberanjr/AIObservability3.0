/**
 * AWS Bedrock raw-telemetry audit data hook. Runs one scoped query per
 * section (4 total: logs, metrics, metrics, events) and zips each result back
 * to its field list — mirrors `../useAttributeAudit.ts`'s shape, reusing the
 * SAME verdict/color helpers from `../coverage.ts` so this section's badges
 * read identically to the OTel span audit above it on the page.
 *
 * Deliberately does NOT participate in Demo Mode (`pageConfig.demoMode`) —
 * same reasoning the standalone AWSBedrockApp's Telemetry tab documents:
 * faking coverage on an instrumentation-gap AUDIT would actively mislead a
 * user trying to find out what's missing in their own tenant.
 */

import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { useSampling, extrapolate } from "../../../scope/SamplingContext";
import { toNum } from "../../../data/format";
import {
  AWS_TELEMETRY_SECTIONS,
  AWS_TELEMETRY_TOTAL_FIELDS,
  type AwsTelemetryField,
  type AwsTelemetrySection,
} from "./catalog";
import { buildAwsTelemetrySectionQuery } from "./queries";
import { classifyVerdict, type Verdict } from "../coverage";

interface SectionRecord {
  section_rows?: number | string;
  [key: string]: number | string | undefined;
}

export interface AwsFieldResult {
  field: AwsTelemetryField;
  /** Extrapolated count (logs/events only; metrics fields report a raw 0/1). */
  count: number;
  present: boolean;
  /** Share of the section population (0 for `metrics` sections — no population concept). */
  share: number;
  verdict: Verdict;
}

export interface AwsSectionResult {
  section: AwsTelemetrySection;
  /** Extrapolated row population (logs/events); 0 for `metrics` sections. */
  rows: number;
  fields: AwsFieldResult[];
  presentCount: number;
  sparseCount: number;
  totalCount: number;
  requiredPresentCount: number;
  requiredTotalCount: number;
  /** True when the section's own query found nothing to report. */
  noData: boolean;
  isLoading: boolean;
  error?: Error;
}

export interface AwsTelemetryOverview {
  requiredCoveragePct: number;
  fieldsPresent: number;
  fieldsTotal: number;
  sectionsFullyCovered: number;
  sparseTotal: number;
}

export interface UseAwsTelemetryAuditResult {
  sections: AwsSectionResult[];
  overview: AwsTelemetryOverview;
  isLoading: boolean;
  /** True once loaded and both population sections AND both metric sections
   *  show nothing — mirrors the standalone app's page-level empty check: a
   *  single metrics section at zero (e.g. Guardrails unconfigured) is NOT
   *  page-empty on its own. */
  isEmpty: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export const useAwsTelemetryAudit = (): UseAwsTelemetryAuditResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();

  // AWS_TELEMETRY_SECTIONS has a fixed length (4), so hook order is stable.
  const results = AWS_TELEMETRY_SECTIONS.map((section) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useScopedDql<SectionRecord>(buildAwsTelemetrySectionQuery(section, scope.timeframe), {
      staleTime: 60_000,
      // Tenant-wide audit: Segments/global-filter would distort coverage %,
      // and these are logs/metrics/events (no span-only injectors apply).
      ignoreGlobalFilter: true,
      ignoreBucketFilter: true,
      ignoreSegments: true,
    }),
  );

  const dataSig = JSON.stringify(results.map((r) => r.data?.records?.[0] ?? null));
  const stateSig = results.map((r) => `${r.isLoading ? 1 : 0}:${r.error?.message ?? ""}`).join("|");

  return useMemo<UseAwsTelemetryAuditResult>(() => {
    const ex = (v: unknown): number => Math.round(extrapolate(num(v), samplingRatio) ?? 0);

    const sections: AwsSectionResult[] = AWS_TELEMETRY_SECTIONS.map((section, si) => {
      const res = results[si];
      const record = res.data?.records?.[0];
      const isMetrics = section.kind === "metrics";
      const rawRows = num(record?.section_rows);
      const rows = isMetrics ? 0 : ex(record?.section_rows);

      const fields: AwsFieldResult[] = section.fields.map((field, fi) => {
        const raw = num(record?.[`a${fi}`]);
        const present = raw > 0;
        // Metrics have no population to share against — binary present/absent
        // collapses cleanly through classifyVerdict(present, present?1:0).
        const share = isMetrics ? (present ? 1 : 0) : rawRows > 0 ? Math.min(1, raw / rawRows) : 0;
        return {
          field,
          count: isMetrics ? (present ? 1 : 0) : ex(record?.[`a${fi}`]),
          present,
          share,
          verdict: classifyVerdict(present, share),
        };
      });

      const presentCount = fields.filter((f) => f.present).length;
      const sparseCount = fields.filter((f) => f.verdict === "sparse").length;
      const requiredFields = fields.filter((f) => f.field.required);

      return {
        section,
        rows,
        fields,
        presentCount,
        sparseCount,
        totalCount: fields.length,
        requiredPresentCount: requiredFields.filter((f) => f.present).length,
        requiredTotalCount: requiredFields.length,
        noData: !res.isLoading && (isMetrics ? presentCount === 0 : rawRows === 0),
        isLoading: res.isLoading,
        error: res.error ?? undefined,
      };
    });

    const requiredPresent = sections.reduce((a, s) => a + s.requiredPresentCount, 0);
    const requiredTotal = sections.reduce((a, s) => a + s.requiredTotalCount, 0);
    const fieldsPresent = sections.reduce((a, s) => a + s.presentCount, 0);

    const overview: AwsTelemetryOverview = {
      requiredCoveragePct: requiredTotal > 0 ? (requiredPresent / requiredTotal) * 100 : 0,
      fieldsPresent,
      fieldsTotal: AWS_TELEMETRY_TOTAL_FIELDS,
      sectionsFullyCovered: sections.filter((s) => s.totalCount > 0 && s.presentCount === s.totalCount).length,
      sparseTotal: sections.reduce((a, s) => a + s.sparseCount, 0),
    };

    const isLoading = results.some((r) => r.isLoading);
    const firstError = results.find((r) => r.error)?.error ?? undefined;
    // Page-empty only when BOTH population sections (logs, events) AND both
    // metrics sections show nothing — a single unconfigured metrics section
    // (e.g. Guardrails) must not read as "no telemetry at all".
    const isEmpty = !isLoading && sections.every((s) => s.noData);

    return { sections, overview, isLoading, isEmpty, error: firstError };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig, stateSig, samplingRatio]);
};
