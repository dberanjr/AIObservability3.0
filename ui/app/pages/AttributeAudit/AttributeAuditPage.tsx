import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AnalyticsIcon } from "@dynatrace/strato-icons";
import { ErrorBanner } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { tenantLabel } from "../../lib/tenant";
import { useScope } from "../../scope/ScopeContext";
import { GROUPS, type AuditSection } from "./catalog";
import { useAttributeAudit, type AttrResult, type SectionResult } from "./useAttributeAudit";
import { SectionCard } from "./SectionCard";
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
  color,
  info,
}: {
  label: string;
  value: string;
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

  const toggleSection = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  // Jump from the hero TOC: expand the target section, then scroll to it.
  const jumpToSection = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: false }));
    requestAnimationFrame(() => {
      document
        .getElementById(`aaa-section-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
            segments, and global filters.
          </Text>
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
                  const gaps = overview.sectionCount - overview.sectionsFullyCovered;
                  return (
                <Flex flexDirection="column" gap={12} style={{ flex: "0 0 auto" }}>
                  <Flex gap={24} style={{ flexWrap: "wrap" }}>
                    <HeroStat
                      label="Attributes present"
                      value={loadingCounts ? "—" : `${overview.presentTotal} / ${overview.total}`}
                      color={coverageTone(overview.coveragePct)}
                      info="Distinct attributes emitted on at least one span, across all 10 categories, in the active window."
                    />
                    <HeroStat
                      label="Categories complete"
                      value={loadingCounts ? "—" : `${overview.sectionsFullyCovered} / ${overview.sectionCount}`}
                      info="Categories where every audited attribute is present."
                    />
                    <HeroStat
                      label="Categories with gaps"
                      value={loadingCounts ? "—" : `${gaps}`}
                      color={gaps > 0 ? "var(--amber)" : "var(--green-2)"}
                      info="Categories missing at least one attribute."
                    />
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
            {GROUPS.map((group) => (
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

                {group.sectionIds.map((id) => {
                  const result = audit.sections.find((s) => s.section.id === id);
                  if (!result) return null;
                  return (
                    <SectionCard
                      key={id}
                      result={result}
                      collapsed={!!collapsed[id]}
                      onToggle={() => toggleSection(id)}
                      onAttrClick={(attr) =>
                        setSelected({ section: result.section, attr })
                      }
                    />
                  );
                })}
              </Flex>
            ))}

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
