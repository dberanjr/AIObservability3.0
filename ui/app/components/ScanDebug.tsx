import React from "react";
import { Text } from "@dynatrace/strato-components/typography";
import {
  fmtBudgetPct,
  fmtScanBytes,
  fmtSecs1,
  scanBudgetFraction,
  scanBudgetSeverity,
} from "../data/format";
import { useScanTotal } from "../scope/ScanReportContext";
import { useScanLimit, SCAN_LIMIT_LABELS } from "../scope/ScanLimitContext";
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
  const { scanStats } = useTweaks().pageConfig;
  const total = useScanTotal();
  if (scanStats !== "tiles" || !total) return null;
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

/**
 * MINIMAL ALWAYS-ON scan-cost readout for the status line (scan-4/5/7): scanned
 * bytes, the scanned-vs-budget ratio, and the query count — phrased for a normal
 * user, in calm Strato text tokens (NOT the dev-only neon pill, which stays
 * gated on scanStats=tiles). The page budget is the per-fetch scan limit times
 * the query count (each query carries the same cap). Neutral by default; the
 * scanned value turns amber when a query truncated (limitHit) and the percentage
 * turns amber as it approaches the budget, so the everyday number itself signals
 * fidelity. Renders nothing until the first query lands.
 */
export const PageScanReadout = () => {
  const { scanStats } = useTweaks().pageConfig;
  const total = useScanTotal();
  const { scanLimitGb } = useScanLimit();
  if (scanStats === "off" || !total || total.queryCount === 0) return null;

  const q = total.queryCount;
  const fraction = scanBudgetFraction(total.scannedBytes, scanLimitGb, q);
  const truncated = total.limitHit;
  const pctColor =
    truncated || scanBudgetSeverity(fraction) !== "ok"
      ? "var(--amber)"
      : "var(--text-2)";
  const valueColor = truncated ? "var(--amber)" : "var(--text-2)";
  const budgetBytes = scanLimitGb > 0 ? scanLimitGb * 1e9 * q : 0;
  const perQuery = SCAN_LIMIT_LABELS[scanLimitGb] ?? `${scanLimitGb} GB`;

  const title =
    `This page ran ${q} DQL quer${q === 1 ? "y" : "ies"} and scanned ` +
    `${fmtScanBytes(total.scannedBytes)}` +
    (budgetBytes > 0
      ? ` of a ${fmtScanBytes(budgetBytes)} budget (${perQuery} per query × ${q}).`
      : ` (scan limit: unlimited).`) +
    (truncated
      ? " At least one query hit its scan limit, so some numbers may be partial."
      : "") +
    ` Slowest query ${fmtSecs1(total.executionMs)}.`;

  return (
    <Text style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }} title={title}>
      Scanned{" "}
      <strong style={{ color: valueColor }}>{fmtScanBytes(total.scannedBytes)}</strong>
      {budgetBytes > 0 && <> / {fmtScanBytes(budgetBytes)}</>}
      {fraction != null && (
        <>
          {" "}(<strong style={{ color: pctColor }}>{fmtBudgetPct(fraction)}</strong>)
        </>
      )}
      {" · "}
      {q} quer{q === 1 ? "y" : "ies"}
    </Text>
  );
};
