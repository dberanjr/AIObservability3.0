export interface Timeframe {
  from: string;
  to?: string;
}

/**
 * Global scope shared across pages. Reduced to timeframe-only after the
 * AppCI / Application / Env dropdown filters were retired in favour of
 * Dynatrace platform Segments — those handle entity scoping via
 * filterSegments on the underlying DqlQueryParams.
 */
export interface Scope {
  timeframe: Timeframe;
}

export interface TimePreset {
  value: string;
  label: string;
}

export const TIME_PRESETS: TimePreset[] = [
  { value: "now()-30m", label: "Last 30 minutes" },
  { value: "now()-1h", label: "Last 1 hour" },
  { value: "now()-6h", label: "Last 6 hours" },
  { value: "now()-24h", label: "Last 24 hours" },
  { value: "now()-7d", label: "Last 7 days" },
  { value: "now()-14d", label: "Last 14 days" },
  { value: "now()-30d", label: "Last 30 days" },
];

export const DEFAULT_SCOPE: Scope = {
  timeframe: { from: "now()-1h" },
};
