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
import { GROUPS, COMMUNITY_ATTRS, type AuditSection } from "./catalog";
import { useAttributeAudit, type AttrResult, type SectionResult } from "./useAttributeAudit";
import { SectionCard, TierBadge, TIER_META } from "./SectionCard";
import { AttributeDetailModal } from "./AttributeDetailModal";

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

/** Overall coverage ring (inline SVG donut). */
const CoverageRing = ({ pct }: { pct: number }) => {
  const size = 116;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = coverageTone(pct);
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
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
          coverage
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
      <Text style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.2 }}>
        {sub}
      </Text>
    )}
  </Flex>
);

/** Compact, clickable "coverage by section" list shown in the hero. Clicking
 *  a row expands and scrolls to that section — a live table of contents. */
const SectionOverview = ({
  sections,
  onJump,
}: {
  sections: SectionResult[];
  onJump: (id: string) => void;
}) => (
  <Flex flexDirection="column" gap={4} style={{ flex: 1, minWidth: 240 }}>
    {sections.map((s) => {
      const pct = s.totalCount > 0 ? (s.presentCount / s.totalCount) * 100 : 0;
      const tone =
        s.presentCount === s.totalCount && s.totalCount > 0
          ? "var(--green-2)"
          : s.presentCount === 0
            ? "var(--red)"
            : "var(--amber)";
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
            {`${s.presentCount}/${s.totalCount}`}
          </Text>
        </button>
      );
    })}
  </Flex>
);

export const AttributeAuditPage = () => {
  const { scope } = useScope();
  const audit = useAttributeAudit();
  const subtitle = `${tenantLabel()} · ${timeframeLabel(scope.timeframe.from, scope.timeframe.to)}`;
  const { overview } = audit;

  // Per-section collapse state (default: all expanded) and the attribute
  // selected for the detail modal.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ section: AuditSection; attr: AttrResult } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [communityOpen, setCommunityOpen] = useState(false);
  // Tier filter — all 4 active by default. Search overrides this.
  const [activeTiers, setActiveTiers] = useState<Set<string>>(() => new Set(["A", "B", "C", "D"]));

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

  // Jump from the hero TOC: expand the target section, then scroll to it.
  const jumpToSection = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: false }));
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

        if (attrs.length === 0) return null;
        const presentCount = attrs.filter((a) => a.present).length;
        return {
          ...section,
          attributes: attrs,
          presentCount,
          totalCount: attrs.length,
          coveragePct: attrs.length > 0 ? (presentCount / attrs.length) * 100 : 0,
          // tierStats stays unfiltered so section header shows full tier context
        };
      })
      .filter((s): s is SectionResult => s !== null);
  }, [audit.sections, searchQuery, activeTiers]);

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

  // While searching, force-open the community section so matches are visible.
  const communitySearchActive = !!searchQuery.trim();
  const communityShown =
    communityOpen || (communitySearchActive && communityMatches.length > 0);

  // Force-expand sections that have visible content when search or tier filter is active.
  const isSectionCollapsed = (id: string): boolean => {
    const isFiltering = searchQuery.trim() || activeTiers.size < 4;
    if (isFiltering && filteredSections.some((s) => s.section.id === id)) {
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
                  title={active ? `Hide ${meta.label}: ${meta.longLabel}` : `Show ${meta.label}: ${meta.longLabel}`}
                  onClick={() => toggleTier(tier)}
                  style={{
                    appearance: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px 3px 6px",
                    borderRadius: 999,
                    border: `1px solid ${active ? meta.color : "var(--border)"}`,
                    background: active
                      ? `color-mix(in oklab, ${meta.color} 10%, var(--surface))`
                      : "var(--surface)",
                    color: active ? meta.color : "var(--text-4)",
                    cursor: "pointer",
                    font: "inherit",
                    opacity: active ? 1 : 0.5,
                    transition: "opacity 0.12s, border-color 0.12s, background 0.12s",
                  }}
                >
                  <TierBadge tier={tier} compact />
                  <Text style={{ fontSize: 11, fontWeight: 600, color: "inherit" }}>
                    {meta.longLabel}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: "var(--text-3)", marginLeft: 1, fontVariantNumeric: "tabular-nums" }}>
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

            {/* Expand / collapse every section. Disabled while a search or tier
                filter is active, since those force matching sections open. */}
            {(() => {
              const isFiltering = !!searchQuery.trim() || activeTiers.size < 4;
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
                {audit.isLoading && overview.presentTotal === 0 ? (
                  <Skeleton style={{ height: 116, width: 116, borderRadius: "50%" }} />
                ) : (
                  <CoverageRing pct={overview.coveragePct} />
                )}

                {(() => {
                  // While the first section queries are still loading, the
                  // coverage counts are all-zero and would misleadingly read
                  // "0 complete / 10 gaps". Show an em-dash until data lands.
                  const loadingCounts = audit.isLoading && overview.presentTotal === 0;
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
                          color="#D97706"
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
                          color="#7C3AED"
                          info="Tier C attributes: deep debugging or specialized use cases — sampling hyperparameters, evaluation scores, PII/guardrails."
                        />
                        {/* Tier D — Unnecessary */}
                        <HeroStat
                          label="Other (O)"
                          value={
                            loadingCounts
                              ? "—"
                              : `${tierStats.D.total} total`
                          }
                          sub="migrate or suppress"
                          color="var(--text-4)"
                          info="Tier D attributes: deprecated patterns, content capture anti-patterns (PII risk + storage bloat). These should be migrated to their canonical replacements or suppressed."
                        />
                        {/* Span activity */}
                        <HeroStat
                          label="Span activity"
                          value={fmtCount(overview.spansScanned)}
                          info="Sum of all category span populations (categories overlap, so this is an activity indicator, not a unique span count). Extrapolated for sampling."
                        />
                      </Flex>
                    </Flex>
                  );
                })()}

                <SectionOverview sections={audit.sections} onJump={jumpToSection} />
              </Flex>
            </Surface>

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
