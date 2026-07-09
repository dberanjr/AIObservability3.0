import { toNum } from "../../data/format";
import type {
  GovKpis,
  ApiActionRow,
  IdentityCallRow,
  SourceIpRow,
  IdentityMfaRow,
  AccessDeniedRow,
  ThrottleRow,
  CrossRegionRow,
  ControlPlaneRow,
  ReconciliationRow,
  AccountRegionRow,
  GovTimeseries,
} from "./types";

type Rec = Record<string, unknown>;

/** Safe string coercion — a raw DQL value can be an object; String() would
 *  render "[object Object]". Mirrors series.ts's `str()`. */
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const n = (v: unknown): number => {
  const x = toNum(v);
  return Number.isFinite(x) ? x : 0;
};

export const parseGovKpis = (records: Rec[]): GovKpis => {
  const r = records[0] ?? {};
  return {
    totalCalls: n(r.totalCalls),
    distinctIdentities: n(r.distinctIdentities),
    distinctSourceIps: n(r.distinctSourceIps),
    distinctAccounts: n(r.distinctAccounts),
    erroredCalls: n(r.erroredCalls),
    nonMfaCalls: n(r.nonMfaCalls),
    crossRegionCalls: n(r.crossRegionCalls),
  };
};

export const parseApiActions = (records: Rec[]): ApiActionRow[] =>
  records
    .map((r) => ({ eventName: str(r.eventName), calls: n(r.calls) }))
    .filter((r) => r.eventName !== "");

export const parseTopIdentities = (records: Rec[]): IdentityCallRow[] =>
  records
    .map((r) => ({ identity: str(r.identity_name), calls: n(r.calls) }))
    .filter((r) => r.identity !== "");

export const parseTopSourceIps = (records: Rec[]): SourceIpRow[] =>
  records
    .map((r) => ({
      sourceIp: str(r.sourceIp),
      calls: n(r.calls),
      identities: n(r.identities),
    }))
    .filter((r) => r.sourceIp !== "");

export const parseIdentityMfa = (records: Rec[]): IdentityMfaRow[] =>
  records.map((r) => ({
    identity: str(r.identity_name),
    // CloudTrail leaves mfa null on programmatic/role sessions — surface that
    // honestly rather than coercing it to "false".
    mfa: str(r.mfa) || "n/a",
    calls: n(r.calls),
    sourceIps: n(r.source_ips),
  }));

export const parseAccessDenied = (records: Rec[]): AccessDeniedRow[] =>
  records.map((r) => ({
    identity: str(r.identity_name),
    sourceIp: str(r.sourceIp),
    eventName: str(r.eventName),
    deniedCalls: n(r.deniedCalls),
    lastSeen: str(r.lastSeen),
  }));

export const parseThrottles = (records: Rec[]): ThrottleRow[] =>
  records.map((r) => ({
    identity: str(r.identity_name),
    eventName: str(r.eventName),
    sourceIp: str(r.sourceIp),
    region: str(r.region),
    throttledCalls: n(r.throttledCalls),
    lastSeen: str(r.lastSeen),
  }));

export const parseCrossRegion = (records: Rec[]): CrossRegionRow[] =>
  records
    .map((r) => ({
      region: str(r.region),
      inferenceRegion: str(r.inferenceRegion),
      calls: n(r.calls),
    }))
    .filter((r) => r.inferenceRegion !== "");

export const parseControlPlane = (records: Rec[]): ControlPlaneRow[] =>
  records.map((r) => ({
    timestamp: str(r.timestamp),
    eventName: str(r.eventName),
    identity: str(r.identity_name),
    region: str(r.region),
    sourceIp: str(r.sourceIp),
  }));

export const parseReconciliation = (records: Rec[]): ReconciliationRow[] =>
  records.map((r) => ({
    source: str(r.source),
    invocations: n(r.invocations),
  }));

export const parseAccountRegion = (records: Rec[]): AccountRegionRow[] =>
  records
    .map((r) => ({
      accountId: str(r.accountId),
      region: str(r.region),
      calls: n(r.calls),
      identities: n(r.identities),
    }))
    .filter((r) => r.accountId !== "");

// --- Region-residency policy -------------------------------------------------

/** Region family = the geography prefix (`us`, `eu`, `ap`, `ca`, `sa`, …). */
export const regionFamily = (region: string): string => {
  const m = /^([a-z]{2})-/.exec(region);
  return m ? m[1] : "";
};

/**
 * A cross-region inference is a *residency exception* when the inference ran in
 * a different geography (region family) than the request — e.g. a us-east-1
 * request whose inference landed in ap-northeast-2. Same-family cross-region
 * (us-east-1 → us-east-2) is normal cross-region inference, not a residency
 * flag. Empty / equal regions are never exceptions.
 */
export const isResidencyException = (region: string, inferenceRegion: string): boolean => {
  if (!region || !inferenceRegion || region === inferenceRegion) return false;
  const a = regionFamily(region);
  const b = regionFamily(inferenceRegion);
  return a !== "" && b !== "" && a !== b;
};

// --- makeTimeseries fold -----------------------------------------------------

const lenOf = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
const numAt = (v: unknown, i: number): number => {
  const arr = Array.isArray(v) ? (v as unknown[]) : [];
  const x = arr[i];
  return x == null ? 0 : Number.isFinite(toNum(x)) ? toNum(x) : 0;
};

interface TimeframeLike {
  start?: string;
  end?: string;
}

/** Compact bucket label: "M/D HH:MM" for sub-day intervals, "M/D" for day+. */
const bucketLabel = (ms: number, intervalMs: number): string => {
  const d = new Date(ms);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  if (intervalMs >= 86_400_000) return md;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${md} ${hh}:${mm}`;
};

/**
 * Fold a `makeTimeseries … by: { group }` result into parallel value arrays +
 * time labels for AreaChart. `valueField` is the aggregate name (e.g. "calls"),
 * `groupField` the split dimension (e.g. "eventName"). Series are sorted by
 * total desc so the busiest action/error takes the front of the color ramp.
 */
export const foldGovTimeseries = (
  records: Rec[],
  valueField: string,
  groupField: string,
): GovTimeseries => {
  const bucketCount = Math.max(0, ...records.map((r) => lenOf(r[valueField])));
  const first = records[0];
  const tf = first?.timeframe as TimeframeLike | undefined;
  const startMs = tf?.start != null ? Date.parse(String(tf.start)) : NaN;
  const intervalMs = first?.interval != null ? Number(first.interval) / 1e6 : NaN;
  const hasAxis = Number.isFinite(startMs) && Number.isFinite(intervalMs);

  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    labels.push(hasAxis ? bucketLabel(startMs + i * intervalMs, intervalMs) : String(i));
  }

  const series = records
    .map((r) => {
      const values = Array.from({ length: bucketCount }, (_, i) => numAt(r[valueField], i));
      return {
        key: str(r[groupField]) || "—",
        values,
        total: values.reduce((s, v) => s + v, 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .map(({ key, values }) => ({ key, values }));

  return { labels, series };
};
