import type { Timeframe } from "../../scope/types";

/**
 * Scope for the Access & Governance sub-tab. CloudTrail (`fetch events`) has no
 * per-model dimension, so — unlike {@link BedrockScope} — governance is scoped
 * by account + timeframe only. The Model selector is hidden on this tab.
 */
export interface GovScope {
  timeframe: Timeframe;
  /** Selected AWS account ids (ct[recipientAccountId]); empty = all. */
  accounts: string[];
  /** See {@link import("../types").BedrockScope.showExample} — same meaning,
   *  computed once by `BedrockPage` and threaded into both sub-tab scopes. */
  showExample?: boolean;
}

/** Six headline governance counters (one summarize row). */
export interface GovKpis {
  totalCalls: number;
  distinctIdentities: number;
  distinctSourceIps: number;
  distinctAccounts: number;
  erroredCalls: number;
  nonMfaCalls: number;
  crossRegionCalls: number;
}

export interface ApiActionRow {
  eventName: string;
  calls: number;
}

export interface IdentityCallRow {
  identity: string;
  calls: number;
}

export interface SourceIpRow {
  sourceIp: string;
  calls: number;
  identities: number;
}

export interface IdentityMfaRow {
  identity: string;
  mfa: string;
  calls: number;
  sourceIps: number;
}

export interface AccessDeniedRow {
  identity: string;
  sourceIp: string;
  eventName: string;
  deniedCalls: number;
  lastSeen: string;
}

export interface ThrottleRow {
  identity: string;
  eventName: string;
  sourceIp: string;
  region: string;
  throttledCalls: number;
  lastSeen: string;
}

export interface CrossRegionRow {
  region: string;
  inferenceRegion: string;
  calls: number;
}

export interface ControlPlaneRow {
  timestamp: string;
  eventName: string;
  identity: string;
  region: string;
  sourceIp: string;
}

export interface ReconciliationRow {
  source: string;
  invocations: number;
}

export interface AccountRegionRow {
  accountId: string;
  region: string;
  calls: number;
  identities: number;
}

/** A folded makeTimeseries result ready for AreaChart: parallel value arrays
 *  keyed by group (eventName / errorCode) plus per-bucket time labels. */
export interface GovTimeseries {
  labels: string[];
  series: { key: string; values: number[] }[];
}
