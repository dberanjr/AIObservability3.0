/**
 * Access & Governance data hooks — thin wrappers over `useScopedDql` + the pure
 * parsers in parse.ts, one per CloudTrail query. Mirrors `useBedrock.ts`: these
 * are `fetch events` queries with no `gen_ai.*` span attributes, so they bypass
 * the span-only injectors via the three `ignore*` flags, and force full
 * fidelity (`samplingRatioOverride: 1`) so security counts are exact.
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../../scope/useScopedDql";
import type { GovScope } from "./types";
import {
  buildGovKpisQuery,
  buildApiActionsQuery,
  buildApiActionsTimeseriesQuery,
  buildTopIdentitiesQuery,
  buildTopSourceIpsQuery,
  buildIdentityMfaQuery,
  buildAccessDeniedQuery,
  buildThrottleQuery,
  buildErrorsTimeseriesQuery,
  buildCrossRegionQuery,
  buildControlPlaneQuery,
  buildAccountRegionQuery,
  buildReconciliationQuery,
} from "./queries";
import {
  parseGovKpis,
  parseApiActions,
  parseTopIdentities,
  parseTopSourceIps,
  parseIdentityMfa,
  parseAccessDenied,
  parseThrottles,
  parseCrossRegion,
  parseControlPlane,
  parseAccountRegion,
  parseReconciliation,
  foldGovTimeseries,
} from "./parse";

const IGNORE = {
  ignoreGlobalFilter: true,
  ignoreBucketFilter: true,
  ignoreSegments: true,
  samplingRatioOverride: 1,
  staleTime: 60_000,
} as const;

type Rec = Record<string, unknown>;
const recs = (data: { records?: ResultRecord[] } | undefined): Rec[] =>
  data?.records ?? [];

export const useGovKpis = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildGovKpisQuery(s), IGNORE);
  return useMemo(
    () => ({ kpis: parseGovKpis(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useGovApiActions = (s: GovScope) => {
  const bars = useScopedDql<ResultRecord>(buildApiActionsQuery(s), IGNORE);
  const series = useScopedDql<ResultRecord>(buildApiActionsTimeseriesQuery(s), IGNORE);
  return useMemo(
    () => ({
      rows: parseApiActions(recs(bars.data)),
      timeseries: foldGovTimeseries(recs(series.data), "calls", "eventName"),
      isLoading: bars.isLoading || series.isLoading,
    }),
    [bars.data, bars.isLoading, series.data, series.isLoading],
  );
};

export const useGovIdentities = (s: GovScope) => {
  const top = useScopedDql<ResultRecord>(buildTopIdentitiesQuery(s), IGNORE);
  const ips = useScopedDql<ResultRecord>(buildTopSourceIpsQuery(s), IGNORE);
  const mfa = useScopedDql<ResultRecord>(buildIdentityMfaQuery(s), IGNORE);
  return useMemo(
    () => ({
      topIdentities: parseTopIdentities(recs(top.data)),
      topSourceIps: parseTopSourceIps(recs(ips.data)),
      identityMfa: parseIdentityMfa(recs(mfa.data)),
      isLoading: top.isLoading || ips.isLoading || mfa.isLoading,
    }),
    [top.data, top.isLoading, ips.data, ips.isLoading, mfa.data, mfa.isLoading],
  );
};

export const useGovAccessDenied = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildAccessDeniedQuery(s), IGNORE);
  return useMemo(
    () => ({ rows: parseAccessDenied(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useGovThrottles = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildThrottleQuery(s), IGNORE);
  return useMemo(
    () => ({ rows: parseThrottles(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useGovErrorsSeries = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildErrorsTimeseriesQuery(s), IGNORE);
  return useMemo(
    () => ({
      timeseries: foldGovTimeseries(recs(res.data), "errors", "errorCode"),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading],
  );
};

export const useGovCrossRegion = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildCrossRegionQuery(s), IGNORE);
  return useMemo(
    () => ({ rows: parseCrossRegion(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useGovControlPlane = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildControlPlaneQuery(s), IGNORE);
  return useMemo(
    () => ({ rows: parseControlPlane(recs(res.data)), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useGovReconciliation = (s: GovScope) => {
  const recon = useScopedDql<ResultRecord>(buildReconciliationQuery(s), IGNORE);
  const acctRegion = useScopedDql<ResultRecord>(buildAccountRegionQuery(s), IGNORE);
  return useMemo(
    () => ({
      reconciliation: parseReconciliation(recs(recon.data)),
      accountRegion: parseAccountRegion(recs(acctRegion.data)),
      isLoading: recon.isLoading || acctRegion.isLoading,
    }),
    [recon.data, recon.isLoading, acctRegion.data, acctRegion.isLoading],
  );
};
