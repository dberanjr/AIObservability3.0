/**
 * Compact labeled-value stat used by the capability-gated panels. Now a thin
 * shim over the shared <StatTile> so there is a single tile primitive across
 * the app — MiniStat's public prop signature is unchanged, so its existing
 * call sites (SafetyPanel / FeedbackPanel / RagPanel / CacheCostPanel) need no
 * changes. `color` maps to StatTile's valueColor escape hatch.
 */

import React from "react";
import { StatTile } from "./StatTile";

export interface MiniStatProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  /** One-line definition shown via an info icon next to the label. */
  info?: React.ReactNode;
}

export const MiniStat = ({ label, value, sub, color, info }: MiniStatProps) => (
  <StatTile label={label} value={value} sub={sub} valueColor={color} info={info} />
);
