import Colors from "@dynatrace/strato-design-tokens/colors";

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
  series: [
    brand.blue,
    brand.purpleDeep,
    brand.cyan,
    brand.bluePurple,
    brand.green,
    brand.purple,
  ],
  anomaly: Colors.Charts.Status.Critical.Default,
  warning: Colors.Charts.Status.Warning.Default,
  success: Colors.Charts.Status.Ideal.Default,
} as const;

/**
 * Provider color mapping. Used by donut charts, badges, and topology nodes.
 */
export const providerColors = {
  Anthropic: brand.purple,
  OpenAI: brand.green,
  Bedrock: brand.cyan,
  Google: brand.green,
  Azure: brand.blue,
} as const;

const lightSurfaces = {
  "--bg-app": "#efefec",
  "--surface": "#ffffff",
  "--surface-2": "#fafaf8",
  "--surface-3": "#f2f2ef",
  "--border": "#e8e7e1",
  "--text": "#1a1a1a",
  "--text-2": "#4a4a48",
  "--text-3": "#76746e",
  "--text-4": "#a4a29a",
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
  "--text-3": "#80807a",
  "--text-4": "#5c5b56",
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
}
:root[data-theme="light"] {
${toBlock(lightSurfaces)}
}
:root[data-theme="dark"] {
${toBlock(darkSurfaces)}
}

/* ---- Floating cards (app-wide) -------------------------------------------
   Every raised Surface across the app gets the same stronger, softer shadow so
   data elements read as lifted off the page and pop out at the user. Grid tiles
   (.aiobs-tile-item) rise further on hover. */
.strato-surface .surface-background {
  /* !important because Strato applies the raised elevation shadow inline. */
  box-shadow: 0 12px 28px -6px rgba(16, 18, 27, 0.26),
    0 4px 10px -2px rgba(16, 18, 27, 0.14) !important;
  transition: box-shadow 160ms ease, transform 160ms ease;
}
:root[data-theme="dark"] .strato-surface .surface-background {
  box-shadow: 0 14px 32px -6px rgba(0, 0, 0, 0.66),
    0 4px 12px -2px rgba(0, 0, 0, 0.5) !important;
}
.aiobs-tile-item {
  transition: transform 160ms ease;
}
.aiobs-tile-item:hover {
  transform: translateY(-3px);
  z-index: 2;
}
.aiobs-tile-item:hover .surface-background {
  box-shadow: 0 20px 40px -8px rgba(16, 18, 27, 0.32),
    0 6px 14px -3px rgba(16, 18, 27, 0.18) !important;
}
:root[data-theme="dark"] .aiobs-tile-item:hover .surface-background {
  box-shadow: 0 22px 44px -8px rgba(0, 0, 0, 0.75),
    0 6px 16px -3px rgba(0, 0, 0, 0.55) !important;
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

/* ---- Active top-nav tab highlight ----
 * The Header tags the current tab with .aiobs-nav-active (plus isSelected /
 * aria-current). We render a solid brand-color pill with inverted (white) text
 * so the active tab stands out cleanly — no underline. !important wins over
 * Strato's Button classes (which also otherwise add a selected underline). */
.aiobs-nav-active,
.aiobs-nav-active:hover,
.aiobs-nav-active:focus {
  color: #ffffff !important;
  font-weight: 700 !important;
  background: var(--blue) !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}
/* Keep any icon/text descendants white too. */
.aiobs-nav-active * {
  color: #ffffff !important;
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
