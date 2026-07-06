import React, { useState, useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { SearchInput } from "@dynatrace/strato-components/forms";
import { AnalyticsIcon, ExternalLinkIcon, ChevronRightIcon, ChevronDownIcon } from "@dynatrace/strato-icons";
import { ErrorBanner } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { tenantLabel } from "../../lib/tenant";
import { useScope } from "../../scope/ScopeContext";
import { GROUPS, SECTIONS, COMMUNITY_ATTRS, type AuditSection } from "./catalog";
import { useAttributeAudit, type AttrResult, type SectionResult } from "./useAttributeAudit";
import { useBucketDetection } from "./useBucketDetection";
import { SectionCard, TierBadge, TIER_META } from "./SectionCard";
import { AttributeDetailModal } from "./AttributeDetailModal";
import { coverageRampColor } from "./coverage";

const timeframeLabel = (from: string, to?: string): string => {
  const m = /^now\(\)-(\d+)([smhd])$/i.exec(from);
  if (m && (!to || to === "now()")) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const word =
      unit === "s" ? "second" : unit === "m" ? "minute" : unit === "h" ? "hour" : "day";
    return `Last ${n} ${word}${n === 1 ? "" : "s"}`;
  }
  return `${from} to ${to ?? "now()"}`;
};

const coverageTone = (pct: number): string =>
  pct >= 80 ? "var(--green-2)" : pct >= 40 ? "var(--amber)" : "var(--red)";

/** Overall coverage ring (inline SVG donut). Defaults to labelling the value
 *  "mandatory" — it measures Tier-A (Mandatory) coverage, the actionable number
 *  that can legitimately reach 100%. */
const CoverageRing = ({ pct, label = "mandatory" }: { pct: number; label?: string }) => {
  const size = 116;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = coverageTone(pct);
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div
      role="img"
      aria-label={`Mandatory attribute coverage ${Math.round(pct)} percent`}
      style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: tone, fontVariantNumeric: "tabular-nums" }}>
          {`${Math.round(pct)}%`}
        </Text>
        <Text style={{ fontSize: 9.5, color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {label}
        </Text>
      </div>
    </div>
  );
};

const HeroStat = ({
  label,
  value,
  sub,
  color,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  info?: string;
}) => (
  <Flex flexDirection="column" gap={4} style={{ minWidth: 0 }}>
    <Flex alignItems="center" gap={4}>
      <Text
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </Text>
      {info && <InfoTooltip text={info} />}
    </Flex>
    <Text
      style={{
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        color: color ?? "var(--text)",
      }}
    >
      {value}
    </Text>
    {sub && (
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.2 }}>
        {sub}
      </Text>
    )}
  </Flex>
);

/** Compact, clickable "coverage by section" list shown in the hero. Clicking
 *  a row expands and scrolls to that section — a live table of contents.
 *
 *  Bars measure Mandatory + Important (A+B) coverage — the actionable tiers that
 *  can legitimately reach 100% — rather than all-tier coverage (which can never
 *  go green while rare C/D attributes sit missing). When a search is active the
 *  bars instead mirror the filtered counts so the TOC agrees with the section
 *  headers the user scrolls to. */
const SectionOverview = ({
  sections,
  filteredById,
  mirrorFilter,
  onJump,
}: {
  sections: SectionResult[];
  filteredById: Map<string, SectionResult>;
  mirrorFilter: boolean;
  onJump: (id: string) => void;
}) => (
  <Flex flexDirection="column" gap={4} style={{ flex: 1, minWidth: 240 }}>
    {sections.map((s) => {
      const f = filteredById.get(s.section.id);
      // Mirror the filtered counts during search; otherwise show A+B coverage.
      const present = mirrorFilter
        ? (f?.presentCount ?? 0)
        : s.tierStats.A.present + s.tierStats.B.present;
      const total = mirrorFilter
        ? (f?.totalCount ?? 0)
        : s.tierStats.A.total + s.tierStats.B.total;
      const hidden = mirrorFilter && !f;
      const pct = total > 0 ? (present / total) * 100 : 0;
      const tone = coverageRampColor(present, total);
      return (
        <button
          key={s.section.id}
          type="button"
          onClick={() => onJump(s.section.id)}
          title={`Go to ${s.section.title}`}
          className="aaa-toc-row"
          style={{
            appearance: "none",
            border: "none",
            background: "transparent",
            font: "inherit",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 6px",
            borderRadius: 6,
            width: "100%",
            opacity: hidden ? 0.55 : 1,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: "var(--text-2)",
              width: 124,
              flex: "0 0 auto",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            {`${s.section.number}. ${s.section.short}`}
          </Text>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 999,
              background: "var(--surface-3)",
              overflow: "hidden",
              minWidth: 40,
            }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: tone }} />
          </div>
          <Text
            style={{
              fontSize: 10.5,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-3)",
              width: 38,
              textAlign: "right",
              flex: "0 0 auto",
            }}
          >
            {hidden ? "—" : `${present}/${total}`}
          </Text>
        </button>
      );
    })}
  </Flex>
);

export const AttributeAuditPage = () => {
  const { scope } = useScope();
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const audit = useAttributeAudit(selectedBucket);
  const detection = useBucketDetection();
  const subtitle = `${tenantLabel()} · ${timeframeLabel(scope.timeframe.from, scope.timeframe.to)}`;
  const { overview } = audit;
  // Staggered-load progress: how many of the 10 category queries have resolved.
  const sectionCount = audit.sections.length;
  const sectionsLoaded = audit.sections.filter((s) => !s.isLoading).length;

  // Per-section collapse state and the attribute selected for the detail modal.
  // Default: the first pillar (Model & inference core) is expanded; everything
  // below it starts collapsed so the first paint foregrounds the core section
  // instead of a ~110-cell wall.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const firstPillar = new Set(GROUPS[0].sectionIds);
    return Object.fromEntries(
      SECTIONS.filter((s) => !firstPillar.has(s.id)).map((s) => [s.id, true]),
    );
  });
  const [selected, setSelected] = useState<{ section: AuditSection; attr: AttrResult } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [communityOpen, setCommunityOpen] = useState(false);
  // Show only the attributes that are missing — a gaps-first audit path.
  const [gapsOnly, setGapsOnly] = useState(false);
  // Tier filter — default to the actionable Mandatory + Important tiers; users
  // opt into Nice-to-Have / Other explicitly. Search overrides this.
  const [activeTiers, setActiveTiers] = useState<Set<string>>(() => new Set(["A", "B"]));

  const toggleTier = (tier: string) =>
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) { next.delete(tier); } else { next.add(tier); }
      return next;
    });

  const resetTiers = () => setActiveTiers(new Set(["A", "B", "C", "D"]));

  const toggleSection = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // Expand all → clear the collapse map (default state is expanded).
  // Collapse all → mark every section id collapsed.
  const expandAll = () => setCollapsed({});
  const collapseAll = () =>
    setCollapsed(
      Object.fromEntries(audit.sections.map((s) => [s.section.id, true])),
    );

  // Jump from the hero TOC: expand the target section, then scroll to it. If a
  // tier / gaps filter currently hides the whole section (e.g. an all-Tier-D
  // section under the default A+B view), reveal all tiers so the jump lands on
  // real content instead of a missing anchor.
  const jumpToSection = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: false }));
    if (!filteredById.has(id)) {
      resetTiers();
      setGapsOnly(false);
    }
    requestAnimationFrame(() => {
      document
        .getElementById(`aaa-section-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Filter section attributes by search query and/or tier toggles.
  // Search overrides tier filter: any attr matching the query is shown regardless
  // of whether its tier is toggled off.
  const filteredSections = useMemo<SectionResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasQuery = !!q;
    const allTiersActive = activeTiers.size === 4;

    return audit.sections
      .map((section) => {
        let attrs = section.attributes;

        if (hasQuery) {
          // Search bypasses tier filter — surface hidden attrs too.
          attrs = attrs.filter(
            (a) =>
              a.spec.name.toLowerCase().includes(q) ||
              a.spec.what.toLowerCase().includes(q),
          );
        } else if (!allTiersActive) {
          // No search: apply tier filter.
          attrs = attrs.filter((a) => activeTiers.has(a.spec.tier));
        }

        // Gaps-first: keep only the missing attributes.
        if (gapsOnly) attrs = attrs.filter((a) => !a.present);

        if (attrs.length === 0) return null;
        const presentCount = attrs.filter((a) => a.present).length;
        const sparseCount = attrs.filter((a) => a.verdict === "sparse").length;
        return {
          ...section,
          attributes: attrs,
          presentCount,
          sparseCount,
          totalCount: attrs.length,
          coveragePct: attrs.length > 0 ? (presentCount / attrs.length) * 100 : 0,
          // tierStats stays unfiltered so section header shows full tier context
        };
      })
      .filter((s): s is SectionResult => s !== null);
  }, [audit.sections, searchQuery, activeTiers, gapsOnly]);

  // Lookup for the hero TOC so it can mirror the filtered counts on search.
  const filteredById = useMemo(
    () => new Map(filteredSections.map((s) => [s.section.id, s])),
    [filteredSections],
  );

  // Missing Tier-A (Mandatory) attributes across the whole audit — the single
  // most actionable "what am I missing?" list, surfaced as a top-of-page callout.
  const missingMandatory = useMemo(
    () =>
      audit.sections.flatMap((s) =>
        s.attributes
          .filter((a) => a.spec.tier === "A" && !a.present)
          .map((a) => ({ name: a.spec.name, sectionId: s.section.id, short: s.section.short })),
      ),
    [audit.sections],
  );

  // Community / emerging attributes also respect the search box (by name, description,
  // or source), so a query like "token_count" surfaces e.g. llm.token_count.completion.
  const communityMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COMMUNITY_ATTRS;
    return COMMUNITY_ATTRS.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.what.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Total attributes currently shown — announced via an aria-live region so
  // screen-reader users get feedback when search / tier / gaps filters change.
  const visibleAttrCount =
    filteredSections.reduce((a, s) => a + s.totalCount, 0) +
    (searchQuery.trim() ? communityMatches.length : 0);

  // While searching, force-open the community section so matches are visible.
  const communitySearchActive = !!searchQuery.trim();
  const communityShown =
    communityOpen || (communitySearchActive && communityMatches.length > 0);

  // A search or a gaps-only view force-reveals matching sections so results are
  // visible; a plain tier filter does NOT, so the default collapsed layout is
  // preserved. (Tier filtering just re-scopes what shows inside open sections.)
  const forceOpen = !!searchQuery.trim() || gapsOnly;
  const isSectionCollapsed = (id: string): boolean => {
    if (forceOpen && filteredSections.some((s) => s.section.id === id)) {
      return false;
    }
    return !!collapsed[id];
  };

  return (
    <div style={{ padding: "18px 20px 80px" }}>
      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        {/* Page header */}
        <Flex flexDirection="column" gap={2}>
          <Flex alignItems="center" gap={8}>
            <AnalyticsIcon size={20} style={{ color: "var(--blue)" }} />
            <Heading level={1} style={{ fontSize: 20, fontWeight: 600 }}>
              AI Attribute Audit
            </Heading>
          </Flex>
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>{subtitle}</Text>
          <Text style={{ fontSize: 12, color: "var(--text-2)", maxWidth: 920, lineHeight: 1.5, marginTop: 2 }}>
            Audits whether your AI workload emits the OpenTelemetry / OpenLLMetry /
            Traceloop / MCP attributes this app depends on. Each of the 10
            categories below tests every attribute at once and marks it{" "}
            <span style={{ color: "var(--green-2)", fontWeight: 600 }}>present</span> or{" "}
            <span style={{ color: "var(--red)", fontWeight: 600 }}>missing</span> based on
            live span data — honouring the selected timeframe, scan limit, sampling,
            segments, and global filters. Attributes are rated{" "}
            <strong>M</strong> (Mandatory) through <strong>O</strong> (Other).
          </Text>

          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search attributes by name or description…"
            style={{ maxWidth: 560, marginTop: 8 }}
          />

          {/* AI-bucket detection: find which Grail buckets hold AI spans in the
              current timeframe, then scope the whole page to one of them. */}
          <Flex flexDirection="column" gap={6} style={{ marginTop: 10, maxWidth: 560 }}>
            <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={detection.run}
                disabled={detection.isLoading}
                style={{
                  appearance: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--blue)",
                  background: "color-mix(in oklab, var(--blue) 10%, transparent)",
                  color: "var(--blue)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: detection.isLoading ? "default" : "pointer",
                  opacity: detection.isLoading ? 0.6 : 1,
                }}
              >
                {detection.isLoading ? "Detecting…" : "Detect AI buckets"}
              </button>
              {selectedBucket && (
                <Flex alignItems="center" gap={6}>
                  <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                    Scoped to bucket{" "}
                    <strong style={{ color: "var(--blue)", fontFamily: "var(--mono, monospace)" }}>
                      {selectedBucket}
                    </strong>
                  </Text>
                  <button
                    type="button"
                    onClick={() => setSelectedBucket(null)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--text-3)",
                      textDecoration: "underline",
                    }}
                  >
                    Clear
                  </button>
                </Flex>
              )}
            </Flex>
            {detection.hasRun && !detection.isLoading && (
              detection.error ? (
                <Text style={{ fontSize: 11.5, color: "var(--red)" }}>
                  Detection failed: {detection.error.message}
                </Text>
              ) : detection.buckets.length === 0 ? (
                <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                  No AI spans found in any bucket for this timeframe.
                </Text>
              ) : (
                <Flex flexDirection="column" gap={4}>
                  {detection.limitHit && (
                    <Text style={{ fontSize: 11, color: "var(--amber, var(--text-3))", fontStyle: "italic" }}>
                      Detection hit the scan limit — some buckets may be missing.
                      Raise the scan limit or narrow the timeframe.
                    </Text>
                  )}
                  <Text style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 600 }}>
                    Buckets with AI spans — click one to scope this page:
                  </Text>
                  {detection.buckets.map((b) => {
                    const active = b.bucket === selectedBucket;
                    return (
                      <button
                        key={b.bucket}
                        type="button"
                        onClick={() => setSelectedBucket(active ? null : b.bucket)}
                        style={{
                          appearance: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "5px 10px",
                          borderRadius: 8,
                          border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
                          background: active
                            ? "color-mix(in oklab, var(--blue) 10%, transparent)"
                            : "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <Text style={{ fontFamily: "var(--mono, monospace)", fontSize: 12, color: "var(--text-1)" }}>
                          {b.bucket}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                          {fmtCount(b.spans)} spans
                        </Text>
                      </button>
                    );
                  })}
                </Flex>
              )
            )}
          </Flex>

          {/* Tier filter toggles */}
          <Flex alignItems="center" gap={6} style={{ flexWrap: "wrap", marginTop: 6 }}>
            <Text style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 600, flexShrink: 0 }}>
              Show:
            </Text>
            {(["A", "B", "C", "D"] as const).map((tier) => {
              const meta = TIER_META[tier];
              const active = activeTiers.has(tier);
              const ts = overview.tierStats[tier];
              return (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={active}
                  title={active ? `Hide ${meta.label}: ${meta.longLabel}` : `Show ${meta.label}: ${meta.longLabel}`}
                  onClick={() => toggleTier(tier)}
                  style={{
                    appearance: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px 3px 6px",
                    borderRadius: 999,
                    // Inactive state reads through a dashed border + muted fill,
                    // not a blanket opacity, so the count stays legible (a11y).
                    border: active
                      ? `1px solid ${meta.color}`
                      : "1px dashed var(--text-4)",
                    background: active
                      ? `color-mix(in oklab, ${meta.color} 10%, var(--surface))`
                      : "var(--surface-2)",
                    color: active ? meta.color : "var(--text-3)",
                    cursor: "pointer",
                    font: "inherit",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                >
                  <TierBadge tier={tier} compact />
                  <Text style={{ fontSize: 11, fontWeight: 600, color: "inherit" }}>
                    {meta.longLabel}
                  </Text>
                  <Text style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 1, fontVariantNumeric: "tabular-nums" }}>
                    {`${ts.present}/${ts.total}`}
                  </Text>
                </button>
              );
            })}
            {activeTiers.size < 4 && (
              <button
                type="button"
                onClick={resetTiers}
                style={{
                  appearance: "none",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 10.5,
                  color: "var(--blue)",
                  padding: "3px 4px",
                  textDecoration: "underline",
                }}
              >
                Show all
              </button>
            )}

            {/* Gaps-first: show only the missing attributes. */}
            <button
              type="button"
              aria-pressed={gapsOnly}
              onClick={() => setGapsOnly((v) => !v)}
              title="Show only attributes that are missing"
              style={{
                appearance: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: 999,
                border: gapsOnly
                  ? "1px solid var(--red)"
                  : "1px dashed var(--text-4)",
                background: gapsOnly
                  ? "color-mix(in oklab, var(--red) 10%, var(--surface))"
                  : "var(--surface-2)",
                color: gapsOnly ? "var(--red)" : "var(--text-3)",
                cursor: "pointer",
                font: "inherit",
                fontSize: 11,
                fontWeight: 600,
                transition: "border-color 0.12s, background 0.12s",
              }}
            >
              Show gaps only
            </button>

            {/* Expand / collapse every section. Disabled while a search or
                gaps-only view is active, since those force matching sections open. */}
            {(() => {
              const isFiltering = forceOpen;
              const linkStyle = (disabled: boolean) => ({
                appearance: "none" as const,
                background: "transparent",
                border: "none",
                cursor: disabled ? "default" : "pointer",
                font: "inherit",
                fontSize: 10.5,
                fontWeight: 600,
                color: disabled ? "var(--text-4)" : "var(--blue)",
                padding: "3px 4px",
              });
              return (
                <Flex
                  alignItems="center"
                  gap={2}
                  style={{ marginLeft: "auto", flexShrink: 0 }}
                >
                  <button
                    type="button"
                    onClick={expandAll}
                    disabled={isFiltering}
                    title={
                      isFiltering
                        ? "Clear the search / tier filter to control section expansion"
                        : "Expand all sections"
                    }
                    style={linkStyle(isFiltering)}
                  >
                    Expand all
                  </button>
                  <Text style={{ fontSize: 10.5, color: "var(--text-4)" }}>·</Text>
                  <button
                    type="button"
                    onClick={collapseAll}
                    disabled={isFiltering}
                    title={
                      isFiltering
                        ? "Clear the search / tier filter to control section expansion"
                        : "Collapse all sections"
                    }
                    style={linkStyle(isFiltering)}
                  >
                    Collapse all
                  </button>
                </Flex>
              );
            })()}
          </Flex>
        </Flex>

        {audit.error && <ErrorBanner error={audit.error} />}

        {/* Screen-reader announcement of how many attributes match the active
            search / tier / gaps filter (silent otherwise). */}
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {`${visibleAttrCount} attribute${visibleAttrCount === 1 ? "" : "s"} shown`}
        </span>

        {audit.isEmpty && !audit.error ? (
          <EmptyState
            title="No AI spans found in this window"
            description="None of the 10 attribute categories returned spans for the active timeframe, segments, and filters. Try widening the timeframe or clearing filters."
            icon={<AnalyticsIcon size={28} />}
          />
        ) : (
          <>
            {/* Hero */}
            <Surface elevation="raised" padding={16}>
              <Flex gap={24} alignItems="center" style={{ flexWrap: "wrap" }}>
                {/* Ring + progress + secondary all-tier caption. The ring is
                    gated on the full audit finishing (not the first section) so
                    the number never settles at a misleading partial value. */}
                <Flex flexDirection="column" alignItems="center" gap={4} style={{ flex: "0 0 auto" }}>
                  {audit.isLoading ? (
                    <Skeleton style={{ height: 116, width: 116, borderRadius: "50%" }} />
                  ) : (
                    <CoverageRing pct={overview.mandatoryCoveragePct} />
                  )}
                  {audit.isLoading ? (
                    <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                      {`${sectionsLoaded} of ${sectionCount} categories loaded…`}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                      {`${Math.round(overview.coverageExDPct)}% of A–C attributes seen`}
                    </Text>
                  )}
                </Flex>

                {(() => {
                  // Gate the aggregate ring + tier KPIs on the WHOLE audit
                  // finishing — otherwise the moment the first of 10 staggered
                  // queries lands, the numbers flip to a settled-looking but
                  // still-climbing partial value.
                  const loadingCounts = audit.isLoading;
                  const { tierStats } = overview;

                  return (
                    <Flex flexDirection="column" gap={12} style={{ flex: "0 0 auto" }}>
                      <Flex gap={20} style={{ flexWrap: "wrap" }}>
                        {/* Tier A — Mandatory */}
                        <HeroStat
                          label="Mandatory (M)"
                          value={
                            loadingCounts
                              ? "—"
                              : `${tierStats.A.present}/${tierStats.A.total}`
                          }
                          sub={
                            loadingCounts
                              ? undefined
                              : `${overview.mandatoryCoveragePct.toFixed(0)}% covered`
                          }
                          color={TIER_META.A.color}
                          info="Tier A attributes: core AI observability breaks without these — model/provider attribution, token economics, error detection, finish reason."
                        />
                        {/* Tier B — Important */}
                        <HeroStat
                          label="Important (I)"
                          value={
                            loadingCounts
                              ? "—"
                              : `${tierStats.B.present}/${tierStats.B.total}`
                          }
                          color="var(--blue)"
                          info="Tier B attributes: enables key Dynatrace dashboards and analytics — streaming performance, cache economics, agent/tool attribution, session stitching."
                        />
                        {/* Tier C — Nice to Have */}
                        <HeroStat
                          label="Nice to Have (N)"
                          value={
                            loadingCounts
                              ? "—"
                              : `${tierStats.C.present}/${tierStats.C.total}`
                          }
                          color="var(--purple)"
                          info="Tier C attributes: deep debugging or specialized use cases — sampling hyperparameters, evaluation scores, PII/guardrails."
                        />
                        {/* Tier D — Other. Lead with how many are actually
                            EMITTING (each is concrete migrate/suppress work),
                            not the constant catalog size. */}
                        <HeroStat
                          label="Other (O)"
                          value={
                            loadingCounts
                              ? "—"
                              : `${tierStats.D.present} emitting`
                          }
                          sub={
                            loadingCounts
                              ? undefined
                              : `of ${tierStats.D.total} · migrate or suppress`
                          }
                          color={tierStats.D.present > 0 ? "var(--amber)" : "var(--text-4)"}
                          info="Tier D attributes: deprecated patterns, content capture anti-patterns (PII risk + storage bloat). Any that are emitting are concrete work — migrate to the canonical replacement or suppress."
                        />
                        {/* AI spans in window — a single defensible population,
                            not the sum of overlapping category populations. */}
                        <HeroStat
                          label="AI spans in window"
                          value={loadingCounts ? "—" : fmtCount(overview.aiSpansInWindow)}
                          info="The largest single category span population — a defensible lower-bound estimate of AI spans in the window. (Summing categories would double-count the spans they share.) Extrapolated for sampling."
                        />
                      </Flex>

                      {!loadingCounts && overview.deprecatedEmitting > 0 && (
                        <Text style={{ fontSize: 11, color: "var(--amber)", lineHeight: 1.4 }}>
                          {`${overview.deprecatedEmitting} deprecated attribute${overview.deprecatedEmitting === 1 ? "" : "s"} still emitting across all tiers — migrate to canonical spellings.`}
                        </Text>
                      )}

                      {forceOpen && (
                        <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>
                          Ring and tier counts reflect the full audit — the list below is filtered.
                        </Text>
                      )}
                    </Flex>
                  );
                })()}

                <SectionOverview
                  sections={audit.sections}
                  filteredById={filteredById}
                  mirrorFilter={!!searchQuery.trim()}
                  onJump={jumpToSection}
                />
              </Flex>
            </Surface>

            {/* Gaps-first callout: which Mandatory (Tier A) attributes are
                missing, and where — the single most actionable answer to
                "what am I missing?". Each chip jumps to its section. */}
            {!audit.isLoading && missingMandatory.length > 0 && (
              <Surface elevation="flat" padding={12}>
                <Flex flexDirection="column" gap={8}>
                  <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: 700, color: TIER_META.A.color }}>
                      {`${missingMandatory.length} Mandatory attribute${missingMandatory.length === 1 ? "" : "s"} missing`}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      core observability is degraded until these emit — jump to fix:
                    </Text>
                  </Flex>
                  <Flex gap={6} style={{ flexWrap: "wrap" }}>
                    {missingMandatory.map((m) => (
                      <button
                        key={`${m.sectionId}-${m.name}`}
                        type="button"
                        onClick={() => jumpToSection(m.sectionId)}
                        title={`Missing in ${m.short} — jump to section`}
                        style={{
                          appearance: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 9px",
                          borderRadius: 999,
                          border: `1px solid color-mix(in oklab, ${TIER_META.A.color} 40%, transparent)`,
                          background: `color-mix(in oklab, ${TIER_META.A.color} 8%, var(--surface))`,
                          cursor: "pointer",
                          font: "inherit",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", flex: "0 0 auto" }}
                        />
                        <Text
                          style={{
                            fontFamily: "var(--font-mono, ui-monospace, monospace)",
                            fontSize: 11,
                            color: "var(--text-2)",
                          }}
                        >
                          {m.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: "var(--text-4)" }}>{m.short}</Text>
                      </button>
                    ))}
                  </Flex>
                </Flex>
              </Surface>
            )}

            {/* Grouped sections */}
            {filteredSections.length === 0 ? (
              <Surface elevation="flat" padding={20}>
                {searchQuery.trim() ? (
                  <Text style={{ fontSize: 13, color: "var(--text-3)" }}>
                    No audited attributes match <strong>&ldquo;{searchQuery}&rdquo;</strong>.
                    {communityMatches.length > 0
                      ? ` ${communityMatches.length} community / emerging attribute${communityMatches.length === 1 ? "" : "s"} match below.`
                      : " Try a shorter or different term."}
                  </Text>
                ) : gapsOnly ? (
                  <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 13, color: "var(--green-2)", fontWeight: 600 }}>
                      No gaps — every attribute in the selected tiers is present.
                    </Text>
                    <button
                      type="button"
                      onClick={() => setGapsOnly(false)}
                      style={{
                        appearance: "none",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 13,
                        color: "var(--blue)",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Show all attributes
                    </button>
                  </Flex>
                ) : (
                  <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 13, color: "var(--text-3)" }}>
                      No attributes visible — all selected tiers are hidden.
                    </Text>
                    <button
                      type="button"
                      onClick={resetTiers}
                      style={{
                        appearance: "none",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 13,
                        color: "var(--blue)",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Show all tiers
                    </button>
                  </Flex>
                )}
              </Surface>
            ) : (
              GROUPS.map((group) => {
                const groupSections = group.sectionIds
                  .map((id) => filteredSections.find((s) => s.section.id === id))
                  .filter((s): s is SectionResult => s !== undefined);

                if (groupSections.length === 0) return null;

                return (
                  <Flex key={group.id} flexDirection="column" gap={8}>
                    <Flex flexDirection="column" gap={2} style={{ marginTop: 4 }}>
                      <Flex alignItems="center" gap={8}>
                        <div
                          style={{
                            width: 3,
                            height: 16,
                            borderRadius: 2,
                            background: "var(--blue)",
                          }}
                        />
                        <Heading level={2} style={{ fontSize: 15, fontWeight: 700 }}>
                          {group.title}
                        </Heading>
                      </Flex>
                      <Text style={{ fontSize: 11.5, color: "var(--text-3)", paddingLeft: 11 }}>
                        {group.blurb}
                      </Text>
                    </Flex>

                    {groupSections.map((result) => (
                      <SectionCard
                        key={result.section.id}
                        result={result}
                        collapsed={isSectionCollapsed(result.section.id)}
                        onToggle={() => toggleSection(result.section.id)}
                        onAttrClick={(attr) =>
                          setSelected({ section: result.section, attr })
                        }
                        activeTiers={activeTiers}
                        onTierToggle={toggleTier}
                      />
                    ))}
                  </Flex>
                );
              })
            )}

            {/* Caveat */}
            <Surface elevation="flat" padding={12}>
              <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
                <strong>How to read this:</strong> a category's span population is the
                set of spans that could carry its attributes (its denominator). A{" "}
                <span style={{ color: "var(--green-2)", fontWeight: 600 }}>present</span>{" "}
                verdict means the attribute was found on at least one span in the window;{" "}
                <span style={{ color: "var(--red)", fontWeight: 600 }}>missing</span> means
                it was not. Under heavy sampling a rare-but-real attribute can read as a
                false MISSING — set sampling to <em>None</em> or widen the timeframe for a
                definitive verdict on sparse attributes. Span counts are extrapolated to
                the unsampled population; verdicts use the raw counts. Spec links point to
                the OpenTelemetry / OpenLLMetry conventions each attribute follows.
              </Text>
            </Surface>

            {/* Community / emerging attribute discovery */}
            <div id="aaa-community">
              <button
                type="button"
                onClick={() => setCommunityOpen((v) => !v)}
                style={{
                  appearance: "none",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  font: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  width: "100%",
                  color: "var(--text-2)",
                  textAlign: "left",
                }}
              >
                {communityShown ? (
                  <ChevronDownIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
                ) : (
                  <ChevronRightIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
                )}
                <Text style={{ fontSize: 12, fontWeight: 600 }}>
                  {communitySearchActive
                    ? `Community & emerging attributes matching “${searchQuery.trim()}” (${communityMatches.length})`
                    : `Community & emerging attributes not yet tracked (${COMMUNITY_ATTRS.length})`}
                </Text>
              </button>

              {communityShown && (
                <Surface elevation="flat" padding={12} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 12, display: "block" }}>
                    Attributes discovered from the OpenTelemetry GenAI spec, Dynatrace semantic
                    dictionary, and community frameworks that are not currently audited. Consider
                    adding instrumentation for tier A and B attributes in preparation for a future
                    version of this audit.
                  </Text>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {communityMatches.map((a) => (
                      <div
                        key={a.name}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--surface-2)",
                        }}
                      >
                        <Flex alignItems="center" gap={6} style={{ minWidth: 0 }}>
                          <TierBadge tier={a.tier} compact />
                          <Text
                            style={{
                              fontFamily: "var(--font-mono, ui-monospace, monospace)",
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--text)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                              minWidth: 0,
                            }}
                            title={a.name}
                          >
                            {a.name}
                          </Text>
                          <span
                            style={{
                              fontSize: 9,
                              color: "var(--text-4)",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {a.source}
                          </span>
                        </Flex>
                        <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.35 }}>
                          {a.what}
                        </Text>
                        <Text style={{ fontSize: 10, color: "var(--text-4)", fontStyle: "italic" }}>
                          {a.sectionHint}
                        </Text>
                        <Text style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.3 }}>
                          {a.why}
                        </Text>
                        <a
                          href={a.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 10,
                            color: "var(--blue)",
                            textDecoration: "none",
                            marginTop: 2,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLinkIcon size={10} />
                          spec
                        </a>
                      </div>
                    ))}
                  </div>
                </Surface>
              )}
            </div>
          </>
        )}
      </Flex>

      <AttributeDetailModal
        show={selected !== null}
        onClose={() => setSelected(null)}
        section={selected?.section ?? null}
        attr={selected?.attr ?? null}
      />
    </div>
  );
};
