import Colors from "@dynatrace/strato-design-tokens/colors";
import {
  ACCENT_FG_LIGHT,
  ACCENT_HEX,
  CATEGORICAL,
  pickAccentForeground,
} from "./palette";

/**
 * Brand accents for AI Observability v3.
 * Names follow SPEC.md §7. Hex values match DESIGN_HANDOFF.md §1.
 */
export const brand = {
  blue: "#1C5BE5",
  bluePurple: "#4635D6",
  bluePale: "#1497FF",
  cyan: "#54C8E9",
  purple: "#B23BE4",
  purpleDeep: "#6C3AD6",
  purpleDark: "#6F2EA8",
  greenLime: "#BDDF28",
  green: "#73BE28",
  pink: "#E436FF",
  amber: "#B45F06",
  red: "#C0291E",
  intelSoftLight: "#F3ECFB",
  intelSoftDark: "rgba(108, 58, 214, 0.16)",
  // Common technical-UI accents that pair well with the Dynatrace blue
  // family: teal reads as a calm, professional cyan-adjacent; purple-deep
  // is the saturated mid-purple from the brand palette.
  teal: "#0EA5A5",
  // Four gray steps for the Tweaks gray-accent family. Stepped by 25% K
  // (CMYK black ink) so each value reads as a deliberate shade rather than
  // a near-duplicate. Distinct from the typography text-* tokens so they
  // can be re-skinned as accents without dragging labels along.
  gray25: "#bfbfbf",
  gray50: "#808080",
  gray75: "#404040",
  black: "#000000",
} as const;

export const chartPalette = {
  // Shared, perceptually-spaced categorical ramp (see theme/palette.ts). Fixed
  // hexes, decoupled from the accent Tweak so multi-series charts never collapse
  // two series onto one hue.
  series: CATEGORICAL,
  anomaly: Colors.Charts.Status.Critical.Default,
  warning: Colors.Charts.Status.Warning.Default,
  success: Colors.Charts.Status.Ideal.Default,
} as const;

const lightSurfaces = {
  "--bg-app": "#efefec",
  "--surface": "#ffffff",
  "--surface-2": "#fafaf8",
  "--surface-3": "#f2f2ef",
  "--border": "#e8e7e1",
  "--text": "#1a1a1a",
  "--text-2": "#4a4a48",
  // text-3 / text-4 raised for WCAG AA on small captions (~10-11px): on white
  // text-3 ≈ 5.9:1 and text-4 ≈ 4.6:1, both clearing 4.5:1, while keeping the
  // text > text-2 > text-3 > text-4 contrast hierarchy intact.
  "--text-3": "#67655b",
  "--text-4": "#77756b",
  "--intel-soft": brand.intelSoftLight,
};

const darkSurfaces = {
  "--bg-app": "#0a0a0b",
  "--surface": "#131316",
  "--surface-2": "#17171b",
  "--surface-3": "#1d1d22",
  "--border": "#25252b",
  "--text": "#f0efea",
  "--text-2": "#b6b4ad",
  // text-3 / text-4 raised for WCAG AA on small captions (~10-11px): on the
  // dark surface text-3 ≈ 6.0:1 and text-4 ≈ 4.6:1, both clearing 4.5:1, while
  // keeping the text > text-2 > text-3 > text-4 contrast hierarchy intact.
  "--text-3": "#96938d",
  "--text-4": "#807f77",
  "--intel-soft": brand.intelSoftDark,
};

const brandVars = {
  "--blue": brand.blue,
  "--blue-purple": brand.bluePurple,
  "--blue-pale": brand.bluePale,
  "--cyan": brand.cyan,
  "--purple": brand.purpleDeep,
  "--purple-2": brand.purple,
  "--purple-dark": brand.purpleDark,
  "--green-lime": brand.greenLime,
  "--green-2": brand.green,
  "--pink": brand.pink,
  "--amber": brand.amber,
  "--red": brand.red,
};

const density = {
  "--d-row": "36px",
  "--d-row-compact": "30px",
  "--d-tile-pad-y": "16px",
  "--d-tile-pad-x": "18px",
  "--d-panel-pad": "18px",
  "--d-gap": "14px",
};

const radii = {
  "--radius-card": "10px",
  "--shadow": "0 2px 8px rgba(0,0,0,0.06)",
  "--shadow-lg": "0 12px 32px rgba(0,0,0,0.10)",
};

const toBlock = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

/**
 * Per-accent foreground for text/marks that sit ON the accent fill (today the
 * active-nav pill). Derived from each accent's luminance so light accents
 * (cyan, lime, gray25, ...) get near-black text instead of failing-contrast
 * white (UX report Chart-1). Generated from the shared ACCENT_HEX map so the
 * swatches, this CSS, and the contrast unit test all stay in lockstep.
 */
const accentForegroundCss = Object.entries(ACCENT_HEX)
  .map(
    ([name, hex]) =>
      `:root[data-aiobs-accent="${name}"] { --accent-fg: ${pickAccentForeground(
        hex,
      )}; }`,
  )
  .join("\n");

/**
 * Global CSS that overrides Strato AppRoot theming with our brand palette,
 * plus visual rules driven by the Tweaks panel's data-aiobs-* attributes
 * (see TweaksContext).
 *
 * AppRoot sets `data-theme="light" | "dark"` on `:root`. Tweaks mirrors the
 * same data-theme override (and adds data-aiobs-theme for symmetry).
 *
 * Accent: swaps the brand-blue and brand-purple tokens so primary accents
 * (buttons, links, charts that read `var(--blue)`) follow the user's pick.
 *
 * Left rail (data-aiobs-rail="off") hides the top navigation items so users
 * who already know the routes can free up vertical space.
 */
export const themeCss = `
:root {
${toBlock(brandVars)}
${toBlock(density)}
${toBlock(radii)}
  /* Default foreground for marks sitting on the accent fill; per-accent
     overrides below refine it from each accent's luminance. */
  --accent-fg: ${ACCENT_FG_LIGHT};
}
:root[data-theme="light"] {
${toBlock(lightSurfaces)}
}
:root[data-theme="dark"] {
${toBlock(darkSurfaces)}
}

/* ---- Card shadows (app-wide) ---------------------------------------------
   Standard: every raised Surface gets a soft, subtle shadow so cards read as
   gently lifted. Pronounced: ONLY tiles that carry a warning / problem / issue
   (.aiobs-alert-tile) get the heavy pop-out shadow, so a strong shadow reads as
   a SIGNAL that draws the eye rather than global decoration. Composite tiles
   that hold sub-tiles never receive .aiobs-alert-tile, so they stay standard.
   Grid tiles (.aiobs-tile-item) lift slightly on hover. */
.strato-surface .surface-background {
  /* !important because Strato applies the raised elevation shadow inline. */
  box-shadow: 0 2px 6px -1px rgba(16, 18, 27, 0.10),
    0 1px 3px -1px rgba(16, 18, 27, 0.07) !important;
  transition: box-shadow 160ms ease, transform 160ms ease;
}
:root[data-theme="dark"] .strato-surface .surface-background {
  box-shadow: 0 2px 8px -1px rgba(0, 0, 0, 0.5),
    0 1px 3px -1px rgba(0, 0, 0, 0.4) !important;
}
/* Alert tiles (warning / problem / issue) — the pronounced pop-out shadow.
   Defined after the standard rule so it wins at equal specificity. */
.aiobs-alert-tile .surface-background {
  box-shadow: 0 12px 28px -6px rgba(16, 18, 27, 0.26),
    0 4px 10px -2px rgba(16, 18, 27, 0.14) !important;
}
:root[data-theme="dark"] .aiobs-alert-tile .surface-background {
  box-shadow: 0 14px 32px -6px rgba(0, 0, 0, 0.66),
    0 4px 12px -2px rgba(0, 0, 0, 0.5) !important;
}
.aiobs-tile-item {
  transition: transform 160ms ease;
}
.aiobs-tile-item:hover {
  transform: translateY(-2px);
  z-index: 2;
}

/* ---- Tweaks: accent — overrides --blue (the primary accent token most
   components use). The purple variant also swaps --purple-2 so the
   secondary follows. Other accents leave --purple-2 alone. */
:root[data-aiobs-accent="purple"] {
  --blue: ${brand.purple};
  --blue-pale: ${brand.purpleDark};
  --purple-2: ${brand.blue};
  --purple: ${brand.bluePurple};
}
:root[data-aiobs-accent="cyan"]   { --blue: ${brand.cyan};       --blue-pale: ${brand.bluePale}; }
:root[data-aiobs-accent="green"]  { --blue: ${brand.green};      --blue-pale: ${brand.greenLime}; }
:root[data-aiobs-accent="pink"]   { --blue: ${brand.pink};       --blue-pale: ${brand.purple}; }
:root[data-aiobs-accent="amber"]  { --blue: ${brand.amber};      --blue-pale: ${brand.red}; }
:root[data-aiobs-accent="red"]    { --blue: ${brand.red};        --blue-pale: ${brand.amber}; }
:root[data-aiobs-accent="indigo"]     { --blue: ${brand.bluePurple}; --blue-pale: ${brand.purpleDeep}; }
:root[data-aiobs-accent="lime"]       { --blue: ${brand.greenLime};  --blue-pale: ${brand.green}; }
:root[data-aiobs-accent="teal"]       { --blue: ${brand.teal};       --blue-pale: ${brand.cyan}; }
:root[data-aiobs-accent="purpleDeep"] { --blue: ${brand.purpleDeep}; --blue-pale: ${brand.bluePurple}; }
:root[data-aiobs-accent="gray25"]     { --blue: ${brand.gray25};     --blue-pale: ${brand.gray50}; }
:root[data-aiobs-accent="gray50"]     { --blue: ${brand.gray50};     --blue-pale: ${brand.gray75}; }
:root[data-aiobs-accent="gray75"]     { --blue: ${brand.gray75};     --blue-pale: ${brand.black}; }
:root[data-aiobs-accent="black"]      { --blue: ${brand.black};      --blue-pale: ${brand.gray75}; }

/* ---- Accessible foreground on the accent fill (generated) ----
 * Light accents get near-black text; dark accents keep white. See
 * accentForegroundCss above. */
${accentForegroundCss}

/* ---- Active top-nav tab highlight ----
 * The Header tags the current tab with .aiobs-nav-active (plus isSelected /
 * aria-current). We render a solid accent-color pill with an accessible
 * foreground (var(--accent-fg): white on dark accents, near-black on light
 * ones) so the active tab label always meets contrast against the accent fill
 * regardless of the user's accent pick. !important wins over
 * Strato's Button classes (which also otherwise add a selected underline). */
.aiobs-nav-active,
.aiobs-nav-active:hover,
.aiobs-nav-active:focus {
  color: var(--accent-fg) !important;
  font-weight: 700 !important;
  background: var(--blue) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}
/* Keep any icon/text descendants on the same accessible foreground. */
.aiobs-nav-active * {
  color: var(--accent-fg) !important;
}

/* ---- Grouped primary tab strip (IA — Information-1) ----
 * A dedicated row under the app bar holding the four labeled tab clusters
 * (Overview / Analyze / Audit) plus a right-aligned utility cluster (Field
 * Notes / About). Each cluster carries a leading uppercase label and is set
 * off by a 1px divider; the row scrolls horizontally when the viewport is too
 * narrow rather than wrapping. Active pills reuse .aiobs-nav-active above. */
.aiobs-tabnav {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.aiobs-tabnav-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 20px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.aiobs-tabnav-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
/* Divider between labeled clusters: a subtle 1px rule to the group's left. */
.aiobs-tabnav-group--divided {
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
/* Utility cluster (Field Notes / About): pushed to the right and set off by a
   final divider, outside any group label. Collapses to a normal inline
   position (auto margin resolves to 0) when the row overflows and scrolls. */
.aiobs-tabnav-group--utility {
  margin-left: auto;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}
/* Section eyebrows (OVERVIEW / ANALYZE / AUDIT) — deliberately muted and
   lighter than the tab pills (var(--text-2)) so they read as non-interactive
   group headers, not clickable tabs. */
.aiobs-tabnav-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-4);
  white-space: nowrap;
  padding-right: 2px;
  user-select: none;
  cursor: default;
}
.aiobs-tabnav-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: var(--text-2);
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}
.aiobs-tabnav-pill:hover {
  background: color-mix(in oklab, var(--blue) 12%, transparent);
  color: var(--text);
}

/* ---- Overview cross-link pill (IA — Information-3) ----
 * The Summary→Pulse / Pulse→Summary hand-off. A subtle accent-tinted pill that
 * fills solid on hover; on the accent fill it flips to var(--accent-fg) — the
 * same luminance-tuned foreground the active nav pill uses — so the label keeps
 * contrast under any accent pick. Keyboard focus falls back to the global
 * button:focus-visible ring. */
.aiobs-crosslink {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--blue);
  background: color-mix(in oklab, var(--blue) 10%, transparent);
  border: 1px solid color-mix(in oklab, var(--blue) 28%, transparent);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.aiobs-crosslink:hover {
  background: var(--blue);
  color: var(--accent-fg);
  border-color: var(--blue);
}

/* Topology graph canvas: user-resizable height. Height lives on the class (not
   inline) so React re-renders don't reset the user's drag; the browser writes
   an inline height when resized, which wins. */
.aiobs-topology-resize {
  height: 680px;
  min-height: 360px;
  max-height: 1400px;
  resize: vertical;
  overflow: hidden;
  border-radius: 10px;
}

/* AAA attribute tiles: lift slightly on hover to signal they're clickable. */
.aaa-attr-cell:hover {
  box-shadow: var(--shadow);
  transform: translateY(-1px);
}
.aaa-attr-cell:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
/* AAA table-of-contents rows in the hero: highlight on hover. */
.aaa-toc-row:hover {
  background: color-mix(in oklab, var(--blue) 10%, transparent);
}
.aaa-toc-row:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}

/* Click-to-filter affordance: subtle highlight + boxed underline on hover. */
.aiobs-filter-trigger:hover {
  background: color-mix(in oklab, var(--blue) 14%, transparent);
  box-shadow: inset 0 -1px 0 0 var(--blue);
}
.aiobs-filter-trigger:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}

/* Clickable Explorer overview tile: subtle lift + accent border on hover. */
.aiobs-clickable-tile {
  cursor: pointer;
  transition: box-shadow 0.12s, transform 0.12s;
}
.aiobs-clickable-tile:hover {
  box-shadow: inset 0 0 0 1px var(--blue);
  transform: translateY(-1px);
}
.aiobs-clickable-tile:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}

/* A11Y: unstyled icon/close buttons. Resetting via this CLASS (instead of an
   inline 'all: unset', which would out-specify the stylesheet ring below and
   leave the button with no focus indicator) lets the global button:focus-visible
   rule — higher specificity than this single-class selector — still paint the
   keyboard ring. Used by the bespoke modal close (×) buttons. */
.aiobs-icon-btn {
  all: unset;
  cursor: pointer;
}

/* A11Y: global keyboard focus ring. Many interactive elements use
   'all: unset' / 'appearance: none', which strips the default outline and left
   keyboard users with no visible focus. This restores a ring on keyboard focus
   only (:focus-visible keeps mouse clicks clean); components with their own
   :focus-visible rule above still win by specificity. */
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
  border-radius: 6px;
}

/* Pulse hero: the AI Application Architecture map and the summary tiles sit
   side by side, with the tiles in a fixed-width right column (which the tile
   grid fills as two columns). When the viewport is narrowed, the tiles drop
   BELOW the map so the diagram is always the first priority. */
.aiobs-pulse-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 344px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1180px) {
  .aiobs-pulse-hero {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---- Summary (front door) layout ---------------------------------------- */
/* The page reads top-to-bottom as a narrative, grouped into titled sections.
   Each section owns one row grid; the eyebrow label names the question it
   answers so executives get a story and operators get a workspace. */
.aiobs-summary-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.aiobs-summary-section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.aiobs-summary-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-2);
  white-space: nowrap;
}
.aiobs-summary-section-hint {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Row 1: the fleet-posture hero on the left, the 6 KPI tiles in a 3-col grid
   on the right. The KPI grid drops below the hero as the viewport narrows. */
.aiobs-summary-posture {
  display: grid;
  /* Hero gets the lion's share; the six KPI tiles ride in a tighter right
     column so they read as a compact scoreboard rather than a second hero. */
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.5fr);
  gap: 16px;
  /* start (not stretch) so the KPI tiles keep their own short height and stand
     on their own as cards rather than stretching to the taller hero. */
  align-items: start;
}
.aiobs-summary-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
/* Rows stretch every tile to the tallest sibling so a row reads as one clean
   band. Breathing room comes from each tile's own content (the charts carry
   explicit heights), NOT a fixed row min-height — that way a row of collapsed
   tiles shrinks to a slim strip instead of reserving empty space. Collapsed
   tiles set align-self:start so they stay short next to taller neighbours. */
.aiobs-summary-row3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}
.aiobs-summary-row4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}
.aiobs-summary-row-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}
.aiobs-summary-drill:hover {
  text-decoration: underline;
}

/* Customizable-grid tile affordances: a drag strip along the top edge and a
   resize handle in the bottom-right corner, both revealed on hover so the tile
   reads as a clean card at rest. The card itself clips its content (see
   SummaryCard) so a shrunk tile never spills onto its neighbour. */
.aiobs-tile-item {
  transition: opacity 120ms ease;
}
.aiobs-tile-drag {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  cursor: grab;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 4;
}
.aiobs-tile-drag:active {
  cursor: grabbing;
}
.aiobs-tile-grip {
  margin-top: 3px;
  width: 26px;
  height: 4px;
  border-radius: 999px;
  background: var(--text-4, var(--text-3));
  opacity: 0.7;
}
.aiobs-tile-resize {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 4;
  touch-action: none;
}
.aiobs-tile-item:hover .aiobs-tile-drag,
.aiobs-tile-item:hover .aiobs-tile-resize {
  opacity: 0.85;
}
.aiobs-tile-reset {
  all: unset;
  position: absolute;
  top: -26px;
  right: 0;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
  z-index: 2;
}
.aiobs-tile-reset:hover {
  color: var(--text);
  text-decoration: underline;
}
@media (max-width: 1180px) {
  .aiobs-summary-posture {
    grid-template-columns: minmax(0, 1fr);
  }
  .aiobs-summary-row4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .aiobs-summary-row-bottom {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 760px) {
  .aiobs-summary-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .aiobs-summary-row3,
  .aiobs-summary-row4 {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;
