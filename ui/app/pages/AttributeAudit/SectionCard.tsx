import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  AIModelIcon,
  AgentIcon,
  CodeIcon,
  WorkflowIcon,
  QueryTreeIcon,
  ConnectorIcon,
  TargetFilledIcon,
  UserSessionsIcon,
  DatabaseIcon,
  ContainerIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@dynatrace/strato-icons";
import { fmtCount } from "../../data/format";
import type { SectionIconKey } from "./catalog";
import type { AttrResult, SectionResult, TierStats } from "./useAttributeAudit";

const ICONS: Record<SectionIconKey, typeof AIModelIcon> = {
  llm: AIModelIcon,
  agent: AgentIcon,
  tools: CodeIcon,
  workflow: WorkflowIcon,
  langgraph: QueryTreeIcon,
  mcp: ConnectorIcon,
  evaluation: TargetFilledIcon,
  session: UserSessionsIcon,
  vectordb: DatabaseIcon,
  infra: ContainerIcon,
};

const PRESENT = "var(--green-2)";
const MISSING = "var(--red)";

/** Coverage → accent color. Full green, partial amber, none red. */
const coverageColor = (present: number, total: number): string => {
  if (total === 0) return "var(--text-3)";
  if (present === total) return PRESENT;
  if (present === 0) return MISSING;
  return "var(--amber)";
};

// ─── Tier badge ───────────────────────────────────────────────────────────────

export const TIER_META: Record<string, { label: string; color: string; title: string; longLabel: string }> = {
  A: { label: "A", longLabel: "Mandatory",    color: "#D97706",        title: "Mandatory — core observability breaks without this" },
  B: { label: "B", longLabel: "Important",    color: "var(--blue)",    title: "Important — enables key dashboards and analytics" },
  C: { label: "C", longLabel: "Nice to Have", color: "#7C3AED",        title: "Nice to Have — useful for deep debugging or specialized use cases" },
  D: { label: "D", longLabel: "Unnecessary",  color: "var(--text-4)",  title: "Unnecessary — deprecated, anti-pattern, or low practical value" },
};

export const TierBadge = ({ tier, compact }: { tier: string; compact?: boolean }) => {
  const meta = TIER_META[tier] ?? TIER_META.D;
  return (
    <span
      title={meta.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: compact ? 16 : 18,
        height: compact ? 16 : 18,
        borderRadius: 4,
        fontSize: compact ? 8.5 : 9.5,
        fontWeight: 800,
        letterSpacing: "0.02em",
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${meta.color} 35%, transparent)`,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
};

// ─── Tier stats row ───────────────────────────────────────────────────────────

const TierStatsRow = ({
  stats,
  activeTiers,
  onTierClick,
}: {
  stats: TierStats;
  activeTiers: Set<string>;
  onTierClick: (tier: string) => void;
}) => (
  <Flex alignItems="center" gap={6} style={{ flexWrap: "wrap", marginTop: 4 }}>
    {(["A", "B", "C", "D"] as const).map((t) => {
      const s = stats[t];
      if (s.total === 0) return null;
      const meta = TIER_META[t];
      const active = activeTiers.has(t);
      return (
        <button
          key={t}
          type="button"
          title={`${active ? "Hide" : "Show only"} tier ${t}: ${meta.longLabel}`}
          onClick={(e) => { e.stopPropagation(); onTierClick(t); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTierClick(t); } }}
          style={{
            appearance: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 6px 1px 3px",
            borderRadius: 999,
            border: `1px solid ${active ? meta.color : "var(--border)"}`,
            background: active ? `color-mix(in oklab, ${meta.color} 10%, transparent)` : "transparent",
            cursor: "pointer",
            font: "inherit",
            opacity: active ? 1 : 0.45,
            transition: "opacity 0.1s, border-color 0.1s",
          }}
        >
          <TierBadge tier={t} compact />
          <Text
            style={{
              fontSize: 10,
              fontVariantNumeric: "tabular-nums",
              color: active ? meta.color : "var(--text-4)",
            }}
          >
            {`${s.present}/${s.total}`}
          </Text>
        </button>
      );
    })}
  </Flex>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

const VerdictPill = ({ present }: { present: boolean }) => {
  const color = present ? PRESENT : MISSING;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
      }}
    >
      {present ? "PRESENT" : "MISSING"}
    </span>
  );
};

/** A single attribute cell: status dot, name, what-it-is, span count + share
 *  bar, and a present/missing pill. Clicking opens the attribute detail modal. */
const AttrCell = ({ a, onClick }: { a: AttrResult; onClick: () => void }) => {
  const color = a.present ? PRESENT : MISSING;
  const isDeprecated = !!a.spec.deprecated;
  const isNew = !!a.spec.specNew;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${a.spec.name} — click for details`}
      className="aaa-attr-cell"
      style={{
        appearance: "none",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: a.present
          ? "color-mix(in oklab, var(--green-2) 5%, var(--surface))"
          : "color-mix(in oklab, var(--red) 5%, var(--surface))",
        borderLeft: `3px solid ${color}`,
        minWidth: 0,
        transition: "box-shadow 0.12s, transform 0.12s",
        opacity: isDeprecated ? 0.75 : 1,
      }}
    >
      <Flex alignItems="center" gap={6} justifyContent="space-between" style={{ minWidth: 0 }}>
        <Flex alignItems="center" gap={6} style={{ minWidth: 0, flex: 1 }}>
          <span
            aria-hidden
            style={{
              flex: "0 0 auto",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
            }}
          />
          <TierBadge tier={a.spec.tier ?? "D"} compact />
          <Text
            style={{
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
            title={a.spec.name}
          >
            {a.spec.name}
          </Text>
          {isNew && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "#059669",
                background: "color-mix(in oklab, #059669 12%, transparent)",
                border: "1px solid color-mix(in oklab, #059669 35%, transparent)",
                borderRadius: 3,
                padding: "0px 4px",
              }}
            >
              NEW
            </span>
          )}
        </Flex>
        <VerdictPill present={a.present} />
      </Flex>

      <Text style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.35 }}>
        {a.spec.what}
      </Text>

      {isDeprecated && (
        <Text
          style={{
            fontSize: 9.5,
            color: "var(--text-4)",
            fontStyle: "italic",
            lineHeight: 1.3,
          }}
        >
          {`→ ${a.spec.deprecated}`}
        </Text>
      )}

      <Flex alignItems="center" gap={6} style={{ minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            height: 3,
            borderRadius: 999,
            background: "var(--surface-3)",
            overflow: "hidden",
            minWidth: 24,
          }}
        >
          <div
            style={{
              width: `${Math.max(a.present ? 3 : 0, a.share * 100)}%`,
              height: "100%",
              background: color,
            }}
          />
        </div>
        <Text
          style={{
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
            color: a.present ? "var(--text-2)" : "var(--text-4)",
            whiteSpace: "nowrap",
          }}
        >
          {a.present ? `${fmtCount(a.spans)} spans` : "0 spans"}
        </Text>
      </Flex>
    </button>
  );
};

const SpecLinks = ({
  links,
}: {
  links: { label: string; url: string }[];
}) => (
  <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
    {links.map((l) => (
      <a
        key={l.url}
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10.5,
          color: "var(--blue)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        <ExternalLinkIcon size={11} />
        {l.label}
      </a>
    ))}
  </Flex>
);

export interface SectionCardProps {
  result: SectionResult;
  /** Whether the section body is collapsed. */
  collapsed: boolean;
  /** Toggle the collapsed state for this section. */
  onToggle: () => void;
  /** Open the detail modal for an attribute. */
  onAttrClick: (attr: AttrResult) => void;
  /** Which tiers are currently visible (for TierStatsRow active state). */
  activeTiers: Set<string>;
  /** Called when the user clicks a tier badge in the section header. */
  onTierToggle: (tier: string) => void;
}

export const SectionCard = ({ result, collapsed, onToggle, onAttrClick, activeTiers, onTierToggle }: SectionCardProps) => {
  const { section, attributes, presentCount, totalCount, sectionSpans, noData, isLoading, tierStats } =
    result;
  const Icon = ICONS[section.iconKey];
  const accent = coverageColor(presentCount, totalCount);
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;

  return (
    <Surface elevation="raised" padding={0}>
      {/* Anchor target for in-page navigation; scroll-margin keeps the header clear. */}
      <div id={`aaa-section-${section.id}`} style={{ scrollMarginTop: 16 }} />
      <Flex flexDirection="column">
        {/* Header — click anywhere to collapse/expand */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
          style={{
            padding: "12px 16px",
            borderBottom: collapsed ? "none" : "1px solid var(--border)",
            borderTop: `3px solid ${accent}`,
            borderTopLeftRadius: "var(--radius-card)",
            borderTopRightRadius: "var(--radius-card)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <Flex justifyContent="space-between" alignItems="flex-start" gap={12} style={{ flexWrap: "wrap" }}>
            <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
              <Chevron size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
              <div
                style={{
                  flex: "0 0 auto",
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--blue)",
                  background: "color-mix(in oklab, var(--blue) 12%, var(--surface))",
                }}
              >
                <Icon size={18} />
              </div>
              <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--text-4)",
                  }}
                >
                  {`SECTION ${section.number}`}
                </Text>
                <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                  {section.short}
                </Heading>
              </Flex>
            </Flex>

            {/* Section description inline in the header's empty space (replaces
                the old hover popup that covered the tiles below). */}
            <Text
              style={{
                flex: 1,
                minWidth: 220,
                fontSize: 11,
                color: "var(--text-3)",
                lineHeight: 1.4,
                alignSelf: "center",
              }}
            >
              {section.blurb}
            </Text>

            <Flex flexDirection="column" alignItems="flex-end" gap={4}>
              <Flex alignItems="center" gap={8}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: accent,
                  }}
                >
                  {`${presentCount}/${totalCount} present`}
                </Text>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {noData ? "no spans" : `${fmtCount(sectionSpans)} spans scanned`}
                </span>
              </Flex>
              <div
                style={{
                  width: 160,
                  maxWidth: "40vw",
                  height: 5,
                  borderRadius: 999,
                  background: "var(--surface-3)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${totalCount > 0 ? (presentCount / totalCount) * 100 : 0}%`,
                    height: "100%",
                    background: accent,
                  }}
                />
              </div>
              {/* Compact tier stats: clickable A/B/C/D toggles */}
              <TierStatsRow stats={tierStats} activeTiers={activeTiers} onTierClick={onTierToggle} />
            </Flex>
          </Flex>

          {/* Spec links live inside the clickable header — stop propagation so
              opening a link doesn't also toggle the section. */}
          <div
            style={{ marginTop: 8 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <SpecLinks links={section.links} />
          </div>
        </div>

        {/* Attribute matrix — hidden when collapsed */}
        {!collapsed && (
        <div style={{ padding: 12 }}>
          {isLoading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 8,
              }}
            >
              {Array.from({ length: Math.min(6, totalCount) }).map((_, i) => (
                <Skeleton key={i} style={{ height: 58 }} />
              ))}
            </div>
          ) : noData ? (
            <Text
              style={{
                fontSize: 11.5,
                color: "var(--text-3)",
                padding: "8px 4px",
                display: "block",
              }}
            >
              No spans in this section's population for the selected timeframe,
              segments, and filters — verdicts cannot be evaluated. Widen the
              timeframe or clear filters.
            </Text>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 8,
              }}
            >
              {attributes.map((a) => (
                <AttrCell key={a.spec.name} a={a} onClick={() => onAttrClick(a)} />
              ))}
            </div>
          )}
        </div>
        )}
      </Flex>
    </Surface>
  );
};
