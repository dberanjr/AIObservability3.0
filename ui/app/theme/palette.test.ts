import { describe, expect, it } from "vitest";
import {
  ACCENT_FG_DARK,
  ACCENT_FG_LIGHT,
  ACCENT_HEX,
  CATEGORICAL,
  contrastRatio,
  oklabDistance,
  pickAccentForeground,
  relativeLuminance,
} from "./palette";

// WCAG AA for normal-size text. The active-nav pill label is ~13px bold, which
// is below the "large text" threshold, so it must clear 4.5:1.
const AA_NORMAL = 4.5;

describe("relativeLuminance / contrastRatio", () => {
  it("bounds pure black and white and their contrast", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1C5BE5", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1C5BE5"),
      6,
    );
  });
});

describe("accent foreground contrast (UX report Chart-1)", () => {
  it("every accent pill meets WCAG AA with its chosen foreground", () => {
    for (const [name, hex] of Object.entries(ACCENT_HEX)) {
      const fg = pickAccentForeground(hex);
      const ratio = contrastRatio(hex, fg);
      expect(
        ratio,
        `${name} (${hex}) on ${fg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("routes light accents to dark text and dark accents to white", () => {
    // Light accents where white text previously failed contrast.
    for (const a of ["cyan", "green", "lime", "teal", "gray25", "gray50", "pink"] as const) {
      expect(pickAccentForeground(ACCENT_HEX[a]), a).toBe(ACCENT_FG_DARK);
    }
    // Dark accents keep white.
    for (const a of ["blue", "red", "indigo", "purpleDeep", "gray75", "black"] as const) {
      expect(pickAccentForeground(ACCENT_HEX[a]), a).toBe(ACCENT_FG_LIGHT);
    }
  });

  it("picks whichever foreground actually has more contrast", () => {
    for (const hex of Object.values(ACCENT_HEX)) {
      const chosen = pickAccentForeground(hex);
      const other = chosen === ACCENT_FG_LIGHT ? ACCENT_FG_DARK : ACCENT_FG_LIGHT;
      expect(contrastRatio(hex, chosen)).toBeGreaterThanOrEqual(
        contrastRatio(hex, other),
      );
    }
  });
});

describe("categorical palette (UX report Chart-3 / Chart-4)", () => {
  it("is all resolved hexes, never CSS custom properties (accent-proof)", () => {
    for (const c of CATEGORICAL) {
      expect(c, c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("has no duplicate colours", () => {
    expect(new Set(CATEGORICAL).size).toBe(CATEGORICAL.length);
  });

  it("keeps adjacent entries perceptually separated in OKLab", () => {
    for (let i = 0; i < CATEGORICAL.length - 1; i++) {
      const d = oklabDistance(CATEGORICAL[i], CATEGORICAL[i + 1]);
      expect(
        d,
        `${CATEGORICAL[i]} -> ${CATEGORICAL[i + 1]} dE=${d.toFixed(3)}`,
      ).toBeGreaterThan(0.15);
    }
  });

  it("makes the first six slices mutually distinct (most donuts show <= 6)", () => {
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const d = oklabDistance(CATEGORICAL[i], CATEGORICAL[j]);
        expect(
          d,
          `${CATEGORICAL[i]} vs ${CATEGORICAL[j]} dE=${d.toFixed(3)}`,
        ).toBeGreaterThan(0.13);
      }
    }
  });

  it("is a real improvement over the old adjacent blue-violet pair", () => {
    // purpleDeep #6C3AD6 vs bluePurple #4635D6 sat adjacent in the old ramp.
    const oldWorst = oklabDistance("#6C3AD6", "#4635D6");
    let newWorstAdjacent = Infinity;
    for (let i = 0; i < CATEGORICAL.length - 1; i++) {
      newWorstAdjacent = Math.min(
        newWorstAdjacent,
        oklabDistance(CATEGORICAL[i], CATEGORICAL[i + 1]),
      );
    }
    expect(newWorstAdjacent).toBeGreaterThan(oldWorst);
  });
});
