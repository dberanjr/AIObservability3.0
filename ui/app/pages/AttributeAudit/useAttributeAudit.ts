/**
 * AAA (AI Attribute Audit) data hook.
 *
 * Runs one scoped DQL query per catalog section (10 total) and zips each
 * result back to its attribute list. Every query goes through useScopedDql, so
 * the active timeframe, scan limit, sampling ratio, segments, and global
 * attribute filter are all honoured automatically.
 *
 * Counts are countIf() aggregates — sampling-variant — so the displayed span
 * counts are extrapolated back to the unsampled population via the active
 * sampling ratio. The present/missing verdict is taken from the raw count
 * (> 0), which is equivalent to the extrapolated count being > 0 but avoids
 * any float rounding ambiguity.
 *
 * SECTIONS has a fixed length, so calling useScopedDql once per section keeps
 * hook order stable across renders.
 */

import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling, extrapolate } from "../../scope/SamplingContext";
import { toNum } from "../../data/format";
import { SECTIONS, TOTAL_ATTRIBUTES, type AttrSpec, type AuditSection, type AttrTier } from "./catalog";
import { buildSectionQuery } from "./queries";

interface SectionRecord {
  section_spans?: number | string;
  [key: string]: number | string | undefined;
}

export interface AttrResult {
  spec: AttrSpec;
  /** Spans carrying the attribute, extrapolated to the population. */
  spans: number;
  /** True when at least one span (raw) carries the attribute. */
  present: boolean;
  /** Share of the section population carrying the attribute (0..1). */
  share: number;
}

/** Per-tier presence counts for a section or the full audit. */
export interface TierStats {
  A: { present: number; total: number };
  B: { present: number; total: number };
  C: { present: number; total: number };
  D: { present: number; total: number };
}

export interface SectionResult {
  section: AuditSection;
  /** Section span population, extrapolated to the unsampled population. */
  sectionSpans: number;
  attributes: AttrResult[];
  presentCount: number;
  totalCount: number;
  /** presentCount / totalCount as a percentage (0..100). */
  coveragePct: number;
  /** True when the section's population query returned zero spans. */
  noData: boolean;
  isLoading: boolean;
  error?: Error;
  /** Attribute counts broken down by tier. */
  tierStats: TierStats;
}

export interface AuditOverview {
  presentTotal: number;
  total: number;
  coveragePct: number;
  /** Sections with 100% of attributes present. */
  sectionsFullyCovered: number;
  /** Sections with zero present attributes (and non-empty population). */
  sectionsEmpty: number;
  sectionCount: number;
  /** Sum of all section populations (note: sections overlap, so this is a
   *  coarse activity indicator, not a unique span count). */
  spansScanned: number;
  /** Percentage of tier-A (Mandatory) attributes present across all sections. */
  mandatoryCoveragePct: number;
  /** Tier-by-tier attribute counts across all sections. */
  tierStats: TierStats;
}

export interface UseAttributeAuditResult {
  sections: SectionResult[];
  overview: AuditOverview;
  isLoading: boolean;
  /** True once loaded and every section population is empty. */
  isEmpty: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const EMPTY_TIER_STATS = (): TierStats => ({
  A: { present: 0, total: 0 },
  B: { present: 0, total: 0 },
  C: { present: 0, total: 0 },
  D: { present: 0, total: 0 },
});

const computeTierStats = (attributes: AttrResult[]): TierStats => {
  const stats = EMPTY_TIER_STATS();
  for (const a of attributes) {
    const t: AttrTier = a.spec.tier ?? "D";
    stats[t].total += 1;
    if (a.present) stats[t].present += 1;
  }
  return stats;
};

const mergeTierStats = (all: TierStats[]): TierStats => {
  const merged = EMPTY_TIER_STATS();
  for (const s of all) {
    for (const t of ["A", "B", "C", "D"] as AttrTier[]) {
      merged[t].total += s[t].total;
      merged[t].present += s[t].present;
    }
  }
  return merged;
};

export const useAttributeAudit = (): UseAttributeAuditResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();

  // One scoped query per section. SECTIONS length is constant, so the hook
  // order is stable across renders.
  const results = SECTIONS.map((section) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useScopedDql<SectionRecord>(buildSectionQuery(section, scope.timeframe), {
      staleTime: 60_000,
      // The audit measures fleet-wide attribute presence — the host's global
      // filter is trace-scoped, which would distort coverage %. Opt out so the
      // numbers reflect the whole fleet (timeframe + service scope still apply).
      ignoreGlobalFilter: true,
    }),
  );

  // Stable signatures so useMemo recomputes on any query change without a
  // spread dependency array (which eslint can't statically verify).
  const dataSig = JSON.stringify(
    results.map((r) => r.data?.records?.[0] ?? null),
  );
  const stateSig = results
    .map((r) => `${r.isLoading ? 1 : 0}:${r.error?.message ?? ""}`)
    .join("|");

  return useMemo<UseAttributeAuditResult>(() => {
    const ex = (v: unknown): number =>
      Math.round(extrapolate(num(v), samplingRatio) ?? 0);

    const sections: SectionResult[] = SECTIONS.map((section, si) => {
      const res = results[si];
      const record = res.data?.records?.[0];
      const rawSpans = num(record?.section_spans);
      const sectionSpans = ex(record?.section_spans);

      const attributes: AttrResult[] = section.attributes.map((spec, ai) => {
        const raw = num(record?.[`a${ai}`]);
        return {
          spec,
          spans: ex(record?.[`a${ai}`]),
          present: raw > 0,
          share: rawSpans > 0 ? Math.min(1, raw / rawSpans) : 0,
        };
      });

      const presentCount = attributes.filter((a) => a.present).length;
      const totalCount = attributes.length;
      const tierStats = computeTierStats(attributes);

      return {
        section,
        sectionSpans,
        attributes,
        presentCount,
        totalCount,
        coveragePct: totalCount > 0 ? (presentCount / totalCount) * 100 : 0,
        noData: !res.isLoading && rawSpans === 0,
        isLoading: res.isLoading,
        error: res.error ?? undefined,
        tierStats,
      };
    });

    const presentTotal = sections.reduce((a, s) => a + s.presentCount, 0);
    const total = TOTAL_ATTRIBUTES;
    const tierStats = mergeTierStats(sections.map((s) => s.tierStats));
    const mandatoryA = tierStats.A;
    const mandatoryCoveragePct =
      mandatoryA.total > 0
        ? (mandatoryA.present / mandatoryA.total) * 100
        : 0;

    const overview: AuditOverview = {
      presentTotal,
      total,
      coveragePct: total > 0 ? (presentTotal / total) * 100 : 0,
      sectionsFullyCovered: sections.filter(
        (s) => s.totalCount > 0 && s.presentCount === s.totalCount,
      ).length,
      sectionsEmpty: sections.filter(
        (s) => !s.noData && s.presentCount === 0,
      ).length,
      sectionCount: sections.length,
      spansScanned: sections.reduce((a, s) => a + s.sectionSpans, 0),
      mandatoryCoveragePct,
      tierStats,
    };

    const isLoading = results.some((r) => r.isLoading);
    const firstError = results.find((r) => r.error)?.error ?? undefined;
    const isEmpty = !isLoading && sections.every((s) => s.noData);

    return { sections, overview, isLoading, isEmpty, error: firstError };
    // results is read inside but its per-query changes are captured by the
    // dataSig / stateSig signatures, which are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSig, stateSig, samplingRatio]);
};
