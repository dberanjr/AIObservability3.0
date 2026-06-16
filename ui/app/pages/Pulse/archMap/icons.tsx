/**
 * Tier glyphs for the node-map — Strato-style 1.7px line icons, keyed by the
 * AI architecture LayerKey. Inherit `currentColor` so the node can tint them.
 */
import React from "react";
import type { LayerKey } from "../../../data/ai-layer-patterns";

const wrap = (paths: React.ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {paths}
  </svg>
);

export const TIER_ICONS: Record<LayerKey, React.ReactNode> = {
  client: wrap(
    <g>
      <rect x="2.5" y="4" width="19" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </g>,
  ),
  gateway: wrap(<path d="M12 2.5l7.5 3v5c0 4.4-3.1 7.6-7.5 9-4.4-1.4-7.5-4.6-7.5-9v-5z" />),
  orchestrator: wrap(
    <g>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M8 7l8 4M8 17l8-4" />
    </g>,
  ),
  agent: wrap(
    <g>
      <rect x="4.5" y="7.5" width="15" height="11" rx="2.5" />
      <path d="M12 4.5v3M9 12.5h.01M15 12.5h.01M9.5 15.5h5" />
      <path d="M2.5 11v3M21.5 11v3" />
    </g>,
  ),
  tools: wrap(
    <path d="M14.5 6a3.5 3.5 0 0 0-4.9 4.4l-6 6 2 2 6-6A3.5 3.5 0 0 0 18 9l-2.3 2.3-1.4-1.4L16.6 7.6z" />,
  ),
  llm: wrap(
    <g>
      <path d="M12 3l1.6 4.2L18 8.8l-3.4 2.4L15.4 16 12 13.4 8.6 16l.8-4.8L6 8.8l4.4-1.6z" />
      <path d="M19 16l.7 1.8L21.5 18l-1.4.9.3 1.8-1.4-1-1.4 1 .3-1.8-1.4-.9 1.8-.2z" />
    </g>,
  ),
  vectordb: wrap(
    <g>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </g>,
  ),
  memory: wrap(
    <g>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M8 4v16M8 8h12M8 14h12" />
    </g>,
  ),
};
