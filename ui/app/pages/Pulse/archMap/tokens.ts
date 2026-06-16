/**
 * Colour tokens for the AI Application Architecture node-map.
 *
 * Confirmed mappings (design handoff go-ahead):
 *   health green   → --green-2 (brand green, theme-aware)
 *   core indigo    → #474fcf  (orchestrator / agent tier)
 *   resource teal  → #0EA5A5  (tools / llm / vector / memory tier)
 *   loop magenta   → #9033a3  (the feedback / reasoning-loop edge)
 *
 * Status colours reuse the app's existing semantic tokens so the map tracks
 * the same health palette as the rest of Pulse. Category colours are fixed
 * accents (intentionally theme-independent — they identify a tier, not a state).
 *
 * These are surfaced as scoped CSS custom properties on `.am-root` (see
 * AM_ROOT_VARS) so the stylesheet can reference them without leaking globals.
 */
import type { NodeCategory, NodeStatus } from "./model";

export const ARCH_COLORS = {
  health: "var(--green-2)",
  warning: "var(--amber)",
  critical: "var(--red)",
  muted: "var(--text-4)",
  core: "#474fcf",
  resource: "#0ea5a5",
  loop: "#9033a3",
} as const;

/** Status → colour for glyphs, headline numbers, sparklines. */
export const statusColor = (s: NodeStatus): string =>
  s === "critical"
    ? ARCH_COLORS.critical
    : s === "warning"
      ? ARCH_COLORS.warning
      : s === "healthy"
        ? ARCH_COLORS.health
        : ARCH_COLORS.muted;

/** Category → tier accent colour (the node's identity colour). */
export const categoryColor = (c: NodeCategory): string =>
  c === "core" ? ARCH_COLORS.core : c === "resource" ? ARCH_COLORS.resource : ARCH_COLORS.muted;

/**
 * Scoped variables block injected once on the map root so the stylesheet can
 * read `var(--am-core)` etc. Keeps the confirmed accents in one place.
 */
export const AM_ROOT_VARS: React.CSSProperties = {
  ...({
    "--am-health": ARCH_COLORS.health,
    "--am-warning": ARCH_COLORS.warning,
    "--am-critical": ARCH_COLORS.critical,
    "--am-muted": ARCH_COLORS.muted,
    "--am-core": ARCH_COLORS.core,
    "--am-resource": ARCH_COLORS.resource,
    "--am-loop": ARCH_COLORS.loop,
  } as React.CSSProperties),
};
