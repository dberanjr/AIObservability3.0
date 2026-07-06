import type { Accent } from "../tweaks/TweaksContext";

/**
 * Single source of truth for accent hexes, the shared categorical chart
 * palette, and the small color-math helpers used to keep them accessible.
 *
 * Everything here is a *resolved hex* rather than a CSS custom property so
 * that:
 *   - the categorical series palette is fully decoupled from the accent Tweak,
 *     which only remaps --blue and would otherwise collapse two series onto one
 *     hue (UX report Chart-3), and
 *   - the accent foreground choice and palette separation can be verified in a
 *     unit test (UX report Chart-1 asks for a build-time contrast check).
 */

export type NamedAccent = Exclude<Accent, "custom">;

/**
 * Hex value for each named accent swatch. Shared by tokens.ts (which generates
 * the accent CSS + the accessible pill foreground) and TweaksPanel (the swatch
 * buttons) so the two can never drift apart.
 */
export const ACCENT_HEX: Record<NamedAccent, string> = {
  blue: "#1C5BE5",
  purple: "#B23BE4",
  cyan: "#54C8E9",
  green: "#73BE28",
  pink: "#E436FF",
  amber: "#B45F06",
  red: "#C0291E",
  indigo: "#4635D6",
  lime: "#BDDF28",
  teal: "#0EA5A5",
  purpleDeep: "#6C3AD6",
  gray25: "#bfbfbf",
  gray50: "#808080",
  gray75: "#404040",
  black: "#000000",
};

/**
 * Ordered categorical palette for multi-series charts (donuts, stacked bars,
 * tile glyphs). It walks the hue wheel in large steps and alternates lightness
 * (UX report Chart-4) so adjacent slices stay distinguishable and the set reads
 * far better than the old blue-violet-heavy ramp — including for red/green
 * colour-vision deficiencies, which lean on the lightness and blue/orange
 * contrasts that survive. The first six entries are maximised for mutual
 * distinctness because most donuts show <= 6 slices. Fixed hexes render
 * identically in light and dark and are never touched by the accent Tweak.
 */
export const CATEGORICAL: readonly string[] = [
  "#1C5BE5", // blue        — brand anchor
  "#F2A93B", // amber/gold  — warm, light
  "#1F9D57", // green
  "#D6409F", // magenta
  "#16B7C4", // cyan        — light blue-green
  "#E4552E", // orange-red
  "#7B4FD8", // violet
  "#0E6E78", // deep teal   — dark, separates from cyan by lightness
  "#9C4A0F", // brown       — dark warm, separates from amber by lightness
  "#B0177E", // deep magenta
] as const;

/** Foreground candidates for text/marks sitting ON an accent fill. */
export const ACCENT_FG_LIGHT = "#ffffff";
export const ACCENT_FG_DARK = "#141417";

const srgbToLinear = (channel: number): number => {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** WCAG relative luminance of a hex colour (0..1). */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
};

/** WCAG contrast ratio between two hex colours (1..21). */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Pick the foreground (white or near-black) that reads best on top of a given
 * accent fill. Used for the active-nav pill so light accents (cyan, lime,
 * gray25, ...) no longer show low-contrast white text (UX report Chart-1).
 */
export const pickAccentForeground = (accentHex: string): string =>
  contrastRatio(accentHex, ACCENT_FG_LIGHT) >=
  contrastRatio(accentHex, ACCENT_FG_DARK)
    ? ACCENT_FG_LIGHT
    : ACCENT_FG_DARK;

// --- OKLab, for perceptual palette-separation checks (Chart-4) --------------

const linToOklab = (r: number, g: number, b: number): [number, number, number] => {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
};

/** Convert a hex colour to OKLab coordinates. */
export const hexToOklab = (hex: string): [number, number, number] => {
  const [r, g, b] = parseHex(hex);
  return linToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
};

/** Perceptual distance (OKLab Euclidean) between two hex colours. */
export const oklabDistance = (a: string, b: string): number => {
  const [la, aa, ba] = hexToOklab(a);
  const [lb, ab, bb] = hexToOklab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
};
