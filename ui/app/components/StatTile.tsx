import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { InfoTooltip } from "./InfoTooltip";
import {
  STATUS_CUE,
  toneToColor,
  type SemanticStatus,
} from "../theme/statusColor";

export type StatTileEmphasis = "default" | "amber" | "red" | "green";

/** New semantic tone vocabulary (contract). Maps to var(--status-*) via
 *  toneToColor(). Legacy `emphasis` still works and takes second precedence. */
export type StatTileTone = "neutral" | "good" | "warn" | "bad" | "critical";

const EMPHASIS_COLOR: Record<StatTileEmphasis, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
  green: "var(--green-2)",
};

/** tone / emphasis → SemanticStatus, so the non-color cue glyph and the
 *  alert-shadow signal are derived consistently from whichever is supplied. */
const TONE_STATUS: Record<StatTileTone, SemanticStatus> = {
  neutral: "neutral",
  good: "good",
  warn: "warning",
  bad: "critical",
  critical: "critical",
};
const EMPHASIS_STATUS: Record<StatTileEmphasis, SemanticStatus> = {
  default: "neutral",
  green: "good",
  amber: "warning",
  red: "critical",
};

export interface StatTileProps {
  label: string;
  /** The KPI value. When omitted the tile becomes a "visual" tile: the `media`
   *  slot is promoted to the centered primary content and no empty value line
   *  (nor its reserved height) is rendered. When present, behaves as before. */
  value?: string;
  sub?: string;
  /** Legacy color emphasis. Kept for existing call sites; prefer `tone`. */
  emphasis?: StatTileEmphasis;
  /** Semantic tone — colors the value via toneToColor (var(--status-*)). */
  tone?: StatTileTone;
  /** Print the severity's non-color cue glyph next to the value (colorblind
   *  reinforcement). Derives from `tone` (or `emphasis`); no-op when neutral. */
  cue?: boolean;
  /** One-line definition shown via an info icon next to the label. A string is
   *  wrapped in an InfoTooltip; a node is rendered as-is (its own affordance). */
  info?: React.ReactNode;
  /** When provided, the tile becomes clickable (filter / scroll / drill). */
  onActivate?: () => void;
  /** Alias of onActivate — the contract's click handler name. */
  onClick?: () => void;
  /** Toggle state. When defined the tile is a toggle (aria-pressed) and paints
   *  a selected ring/tint when true. */
  active?: boolean;
  /** Accessible description of the click action (falls back to the label). */
  actionLabel?: string;
  /** Optional chip naming the tile's time basis (e.g. "24h", "30d proj"). */
  window?: string;
  /** Explicit override for the value text color (escape hatch for MiniStat's
   *  arbitrary color). Wins over tone / emphasis. */
  valueColor?: string;
  /** A visual element (sparkline, icon, mini-bar) shown under the value. When
   *  `value` is omitted this becomes the tile's centered primary content. */
  media?: React.ReactNode;
  /** Rendered at the top-right of the header row (e.g. an expand/maximize
   *  button). Sits alongside the optional `window` chip. No layout shift when
   *  absent — the header row already reserves its height. */
  headerRight?: React.ReactNode;
  /** Render a skeleton placeholder while the value is loading. */
  loading?: boolean;
  /** Extra content under the value (delta chip, sparkline, composition bar). */
  children?: React.ReactNode;
}

/** Content padding driven by the shared density tokens (fallbacks match the
 *  token defaults) instead of a magic number. */
const TILE_PADDING = "var(--d-tile-pad-y, 16px) var(--d-tile-pad-x, 18px)";

/**
 * The shared KPI stat tile — one primitive for the small label/value/sub cards
 * every page's tile row uses (previously a per-page copy). Raised Surface (the
 * app-wide floating shadow), optional info tooltip, a semantic tone + non-color
 * cue glyph, an optional click/toggle action with proper keyboard + aria
 * semantics, an optional time-basis window chip, a media slot, a loading
 * skeleton, and a children slot for a delta / sparkline / bar. Complex tiles
 * with bespoke visuals (Summary/Pulse) keep their own components.
 */
export const StatTile = ({
  label,
  value,
  sub,
  emphasis = "default",
  tone,
  cue,
  info,
  onActivate,
  onClick,
  active,
  actionLabel,
  window,
  valueColor,
  media,
  headerRight,
  loading,
  children,
}: StatTileProps) => {
  const activate = onClick ?? onActivate;
  const interactive = !!activate;

  // Severity (from tone if given, else the legacy emphasis) drives the cue
  // glyph and the alert pop-out shadow.
  const status: SemanticStatus = tone
    ? TONE_STATUS[tone]
    : EMPHASIS_STATUS[emphasis];
  const resolvedColor =
    valueColor ?? (tone ? toneToColor(tone) : EMPHASIS_COLOR[emphasis]);

  // Only tiles carrying a warning/problem get the pronounced pop-out shadow
  // (via .aiobs-alert-tile) — good/neutral tiles keep the standard shadow.
  const alert = status === "warning" || status === "critical";
  const className =
    [interactive && "aiobs-clickable-tile", alert && "aiobs-alert-tile"]
      .filter(Boolean)
      .join(" ") || undefined;

  const eyebrow = (
    <Text
      style={{
        fontSize: "var(--eyebrow-size, 11px)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: 1.2,
      }}
    >
      {label}
    </Text>
  );

  const interactiveProps = interactive
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": actionLabel ?? label,
        ...(active !== undefined ? { "aria-pressed": active } : {}),
        onClick: activate,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate?.();
          }
        },
      }
    : {};

  const bodyStyle: React.CSSProperties = {
    padding: TILE_PADDING,
    height: "100%",
    boxSizing: "border-box",
    ...(active
      ? {
          boxShadow: "inset 0 0 0 2px var(--blue)",
          background: "color-mix(in oklab, var(--blue) 8%, transparent)",
          borderRadius: "var(--radius-card, 10px)",
        }
      : {}),
  };

  if (loading) {
    return (
      <Surface elevation="raised" padding={0}>
        <div style={{ padding: TILE_PADDING }}>
          <Flex flexDirection="column" gap={8}>
            {eyebrow}
            <Skeleton style={{ height: 22, width: "60%", borderRadius: 6 }} />
            {sub && (
              <Skeleton style={{ height: 12, width: "40%", borderRadius: 6 }} />
            )}
          </Flex>
        </div>
      </Surface>
    );
  }

  const hasValue = value !== undefined;
  const showCue = hasValue && !!cue && status !== "neutral";
  const cueMeta = STATUS_CUE[status] as {
    glyph: string;
    label?: string;
    word?: string;
  };
  const cueWord = cueMeta.word ?? cueMeta.label ?? "";

  return (
    <Surface
      elevation="raised"
      padding={0}
      className={className}
      {...interactiveProps}
    >
      <div style={bodyStyle}>
        <Flex flexDirection="column" gap={4} style={{ height: "100%" }}>
          <Flex
            alignItems="center"
            gap={4}
            justifyContent="space-between"
            style={{ minHeight: 28 }}
          >
            <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
              {eyebrow}
              {info != null && (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{ display: "inline-flex", flex: "0 0 auto" }}
                >
                  {typeof info === "string" ? (
                    <InfoTooltip text={info} size={12} />
                  ) : (
                    info
                  )}
                </span>
              )}
            </Flex>
            {(window || headerRight != null) && (
              <Flex
                alignItems="center"
                gap={4}
                style={{ flex: "0 0 auto" }}
              >
                {window && (
                  <Text
                    title="This tile's time basis"
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "var(--text-3)",
                      background: "var(--surface-2, var(--border))",
                      borderRadius: 4,
                      padding: "1px 5px",
                      whiteSpace: "nowrap",
                      flex: "0 0 auto",
                    }}
                  >
                    {window}
                  </Text>
                )}
                {headerRight != null && (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{ display: "inline-flex", flex: "0 0 auto" }}
                  >
                    {headerRight}
                  </span>
                )}
              </Flex>
            )}
          </Flex>
          {hasValue && (
            <Flex alignItems="center" gap={6} style={{ minWidth: 0 }}>
              {showCue && (
                <span
                  role="img"
                  aria-label={cueWord || undefined}
                  title={cueWord || undefined}
                  style={{
                    color: resolvedColor,
                    fontSize: 12,
                    lineHeight: 1,
                    flex: "0 0 auto",
                  }}
                >
                  {cueMeta.glyph}
                </span>
              )}
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: resolvedColor,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {value}
              </Text>
            </Flex>
          )}
          {sub && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
          )}
          {media != null &&
            (hasValue ? (
              <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "flex-end" }}>
                {media}
              </div>
            ) : (
              <Flex
                alignItems="center"
                justifyContent="center"
                style={{ minWidth: 0, flex: "1 1 auto" }}
              >
                {media}
              </Flex>
            ))}
          {children}
        </Flex>
      </div>
    </Surface>
  );
};
