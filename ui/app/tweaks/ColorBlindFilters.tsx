import React from "react";

/**
 * SVG color-matrix filter definitions for the Tweaks colorblind simulator.
 * Mounted once near the app root; TweaksContext applies `filter: url(#id)`
 * to document.body when one is selected.
 *
 * Matrices follow the standard accessibility-tooling values (Wickline /
 * Fišler / Brettel approximations). Each is a 4x5 affine color transform.
 */
const FILTERS: Array<{ id: string; matrix: string }> = [
  {
    id: "aiobs-cb-protanopia",
    matrix:
      "0.567 0.433 0     0 0 " +
      "0.558 0.442 0     0 0 " +
      "0     0.242 0.758 0 0 " +
      "0     0     0     1 0",
  },
  {
    id: "aiobs-cb-deuteranopia",
    matrix:
      "0.625 0.375 0   0 0 " +
      "0.7   0.3   0   0 0 " +
      "0     0.3   0.7 0 0 " +
      "0     0     0   1 0",
  },
  {
    id: "aiobs-cb-tritanopia",
    matrix:
      "0.95 0.05  0     0 0 " +
      "0    0.433 0.567 0 0 " +
      "0    0.475 0.525 0 0 " +
      "0    0     0     1 0",
  },
  {
    id: "aiobs-cb-achromatopsia",
    matrix:
      "0.299 0.587 0.114 0 0 " +
      "0.299 0.587 0.114 0 0 " +
      "0.299 0.587 0.114 0 0 " +
      "0     0     0     1 0",
  },
];

export const ColorBlindFilters = () => (
  <svg
    aria-hidden
    style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
  >
    <defs>
      {FILTERS.map(({ id, matrix }) => (
        <filter
          key={id}
          id={id}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix type="matrix" values={matrix} />
        </filter>
      ))}
    </defs>
  </svg>
);
