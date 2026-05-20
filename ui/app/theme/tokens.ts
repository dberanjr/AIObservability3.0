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
 * Global CSS that overrides Strato AppRoot theming with our brand palette.
 * AppRoot sets `data-theme="light" | "dark"` on `:root`, so our overrides scope to the same selectors.
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
`;
