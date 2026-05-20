export interface Timeframe {
  from: string;
  to?: string;
}

export interface Scope {
  appCi?: string;
  application?: string;
  env?: string;
  timeframe: Timeframe;
  scanLimitGBytes?: number;
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

export const ENV_OPTIONS: string[] = [
  "dev",
  "qa",
  "stg",
  "nonprod",
  "preprod",
  "production",
];

export const DEFAULT_SCOPE: Scope = {
  timeframe: { from: "now()-24h" },
};
