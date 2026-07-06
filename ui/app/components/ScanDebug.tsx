import React from "react";
import { fmtScanBytes, fmtSecs1 } from "../data/format";
import { useScanTotal } from "../scope/ScanReportContext";
import { useTweaks } from "../tweaks/TweaksContext";

/**
 * Neon pill treatment for the scan stats — a dark chip with an electric-mint
 * value and a soft glow. Reads the same in light and dark themes (the chip
 * carries its own dark background), and makes the debug numbers easy to spot
 * without being mistaken for real KPIs.
 */
export const NEON = "#39ffb0";
export const neonPill = (size: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  fontSize: size,
  lineHeight: 1.3,
  fontFamily: "var(--mono, monospace)",
  fontWeight: 600,
  color: NEON,
  background: "#0b1220",
  border: `1px solid ${NEON}`,
  borderRadius: 999,
  padding: "2px 8px",
  whiteSpace: "nowrap",
  boxShadow: `0 0 6px color-mix(in oklab, ${NEON} 55%, transparent)`,
});

/**
 * Compact page-wide scan total for the status line: the sum of every query's
 * scanned bytes across the current page and the slowest single response. Sits
 * left of "Last refreshed". Only when the debug toggle is on.
 */
export const PageScanTotal = () => {
  const { showScanDebug } = useTweaks().pageConfig;
  const total = useScanTotal();
  if (!showScanDebug || !total) return null;
  const q = total.queryCount;
  return (
    <span
      style={neonPill(11)}
      title={`${q} DQL quer${q === 1 ? "y" : "ies"} · ${fmtScanBytes(total.scannedBytes)} scanned · slowest ${fmtSecs1(total.executionMs)}${total.limitHit ? " · some queries hit the scan limit" : ""}`}
    >
      page · {q} quer{q === 1 ? "y" : "ies"} · {fmtScanBytes(total.scannedBytes)} ·{" "}
      {fmtSecs1(total.executionMs)}
      {total.limitHit ? " ⚠" : ""}
    </span>
  );
};
