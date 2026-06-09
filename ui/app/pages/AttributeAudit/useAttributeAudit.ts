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
import { SECTIONS, TOTAL_ATTRIBUTES, type AttrSpec, type AuditSection } from "./catalog";
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

export const useAttributeAudit = (): UseAttributeAuditResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();

  // One scoped query per section. SECTIONS length is constant, so the hook
  // order is stable across renders.
  const results = SECTIONS.map((section) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useScopedDql<SectionRecord>(buildSectionQuery(section, scope.timeframe), {
      staleTime: 60_000,
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
      };
    });

    const presentTotal = sections.reduce((a, s) => a + s.presentCount, 0);
    const total = TOTAL_ATTRIBUTES;
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
