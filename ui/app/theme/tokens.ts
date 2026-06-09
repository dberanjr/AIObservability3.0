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
 * Tile style:
 *   data-aiobs-tile="card"     — default (Strato raised Surface)
 *   data-aiobs-tile="bordered" — drop the elevation shadow, add a 1px border
 *   data-aiobs-tile="ghost"    — strip elevation, border, and background
 *
 * Density: compact shrinks tile padding so more fits on screen.
 *
 * Accent: swaps the brand-blue and brand-purple tokens so primary accents
 * (buttons, links, charts that read `var(--blue)`) follow the user's pick.
 *
 * Left rail (data-aiobs-rail="off") hides the top navigation items so users
 * who already know the routes can free up vertical space.
 *
 * The tile-style selectors look for raised surfaces by their Strato data
 * attribute. We can't predict the exact class hash, so we target the
 * stable data-elevation marker the component sets.
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

/* ---- Tweaks: density ---- */
:root[data-aiobs-density="compact"] {
  --d-row: 28px;
  --d-row-compact: 24px;
  --d-tile-pad-y: 10px;
  --d-tile-pad-x: 12px;
  --d-panel-pad: 12px;
  --d-gap: 8px;
}
:root[data-aiobs-density="compact"] [data-aiobs-tile-target] {
  padding: 10px 12px !important;
}
/* "minimal" — data-first read; strip chrome (shadows/borders) and shrink
   padding so panels feel like reports, not cards. */
:root[data-aiobs-density="minimal"] {
  --d-row: 22px;
  --d-row-compact: 20px;
  --d-tile-pad-y: 4px;
  --d-tile-pad-x: 6px;
  --d-panel-pad: 8px;
  --d-gap: 6px;
  --shadow: none;
  --shadow-lg: none;
}

/* ---- Tweaks: tile style ----
 * Strato Surface renders an outer .strato-surface div plus an inner
 * .surface-background pseudo-element div that actually carries the
 * elevation shadow + background. We override the inner element so the
 * tweak applies to every Surface across the app without each call site
 * needing to opt in.
 */
:root[data-aiobs-tile="bordered"] .strato-surface .surface-background {
  box-shadow: none !important;
  background: transparent !important;
}
:root[data-aiobs-tile="bordered"] .strato-surface {
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}
:root[data-aiobs-tile="ghost"] .strato-surface .surface-background {
  box-shadow: none !important;
  background: transparent !important;
}
:root[data-aiobs-tile="ghost"] .strato-surface {
  border: none;
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
`;
