import React from "react";

export interface ForecastToggleProps {
  enabled: boolean;
  loading: boolean;
  error: Error | undefined;
  onChange: (next: boolean) => void;
}

/**
 * Pill toggle for overlaying a Dynatrace Intelligence forecast on a time-series
 * chart. Shared by Pulse's token-consumption chart and the Agents invocations
 * chart so both read identically.
 */
export const ForecastToggle = ({
  enabled,
  loading,
  error,
  onChange,
}: ForecastToggleProps) => {
  const label = enabled ? (loading ? "Forecasting…" : "Forecast on") : "Forecast";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle Dynatrace Intelligence forecast overlay"
      onClick={() => onChange(!enabled)}
      title={
        error
          ? `Forecast error: ${error.message}`
          : "Predict the next ~30% of the timeframe using Dynatrace Intelligence (GenericForecastAnalyzer). Forecast always reads unsampled data."
      }
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: enabled ? 600 : 500,
        color: enabled ? "var(--purple-2)" : "var(--text-2)",
        background: enabled ? "var(--intel-soft)" : "var(--surface-2)",
        border: `1px solid ${enabled ? "var(--purple-2)" : "var(--border)"}`,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: enabled ? "var(--purple-2)" : "var(--text-3)",
          opacity: loading ? 0.6 : 1,
        }}
      />
      {label}
    </button>
  );
};
