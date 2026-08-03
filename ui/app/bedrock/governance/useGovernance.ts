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
import {
  buildExfilByDestinationQuery,
  buildExfilActorsQuery,
  buildExfilTimeseriesQuery,
  buildExfilDetailQuery,
  parseExfilDestinations,
  parseExfilActors,
  parseExfilDetail,
} from "./exfiltration";
import {
  DEMO_GOV_KPIS,
  DEMO_API_ACTIONS,
  DEMO_API_ACTIONS_TIMESERIES,
  DEMO_TOP_IDENTITIES,
  DEMO_TOP_SOURCE_IPS,
  DEMO_IDENTITY_MFA,
  DEMO_ACCESS_DENIED,
  DEMO_THROTTLES,
  DEMO_ERRORS_TIMESERIES,
  DEMO_CROSS_REGION,
  DEMO_CONTROL_PLANE,
  DEMO_RECONCILIATION,
  DEMO_ACCOUNT_REGION,
  DEMO_EXFIL_DESTINATIONS,
  DEMO_EXFIL_ACTORS,
  DEMO_EXFIL_TIMESERIES,
  DEMO_EXFIL_DETAIL,
} from "./demoData";

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
  const res = useScopedDql<ResultRecord>(buildGovKpisQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { kpis: DEMO_GOV_KPIS, isLoading: false };
    return { kpis: parseGovKpis(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useGovApiActions = (s: GovScope) => {
  const bars = useScopedDql<ResultRecord>(buildApiActionsQuery(s), { ...IGNORE, enabled: !s.showExample });
  const series = useScopedDql<ResultRecord>(buildApiActionsTimeseriesQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) {
      return { rows: DEMO_API_ACTIONS, timeseries: DEMO_API_ACTIONS_TIMESERIES, isLoading: false };
    }
    return {
      rows: parseApiActions(recs(bars.data)),
      timeseries: foldGovTimeseries(recs(series.data), "calls", "eventName"),
      isLoading: bars.isLoading || series.isLoading,
    };
  }, [s.showExample, bars.data, bars.isLoading, series.data, series.isLoading]);
};

export const useGovIdentities = (s: GovScope) => {
  const top = useScopedDql<ResultRecord>(buildTopIdentitiesQuery(s), { ...IGNORE, enabled: !s.showExample });
  const ips = useScopedDql<ResultRecord>(buildTopSourceIpsQuery(s), { ...IGNORE, enabled: !s.showExample });
  const mfa = useScopedDql<ResultRecord>(buildIdentityMfaQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) {
      return {
        topIdentities: DEMO_TOP_IDENTITIES,
        topSourceIps: DEMO_TOP_SOURCE_IPS,
        identityMfa: DEMO_IDENTITY_MFA,
        isLoading: false,
      };
    }
    return {
      topIdentities: parseTopIdentities(recs(top.data)),
      topSourceIps: parseTopSourceIps(recs(ips.data)),
      identityMfa: parseIdentityMfa(recs(mfa.data)),
      isLoading: top.isLoading || ips.isLoading || mfa.isLoading,
    };
  }, [s.showExample, top.data, top.isLoading, ips.data, ips.isLoading, mfa.data, mfa.isLoading]);
};

export const useGovAccessDenied = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildAccessDeniedQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { rows: DEMO_ACCESS_DENIED, isLoading: false };
    return { rows: parseAccessDenied(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useGovThrottles = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildThrottleQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { rows: DEMO_THROTTLES, isLoading: false };
    return { rows: parseThrottles(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useGovErrorsSeries = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildErrorsTimeseriesQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { timeseries: DEMO_ERRORS_TIMESERIES, isLoading: false };
    return {
      timeseries: foldGovTimeseries(recs(res.data), "errors", "errorCode"),
      isLoading: res.isLoading,
    };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useGovCrossRegion = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildCrossRegionQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { rows: DEMO_CROSS_REGION, isLoading: false };
    return { rows: parseCrossRegion(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useGovControlPlane = (s: GovScope) => {
  const res = useScopedDql<ResultRecord>(buildControlPlaneQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) return { rows: DEMO_CONTROL_PLANE, isLoading: false };
    return { rows: parseControlPlane(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

/**
 * Cross-region / data-exfiltration deep-dive — the four datasets behind the
 * Cross-region tile modal: per-destination-country breakdown, the actors
 * driving out-of-country inference (with client classification), the
 * out-of-country-vs-same-country timeline, and the raw per-call detail list.
 */
export const useExfiltration = (s: GovScope) => {
  const dest = useScopedDql<ResultRecord>(buildExfilByDestinationQuery(s), { ...IGNORE, enabled: !s.showExample });
  const actors = useScopedDql<ResultRecord>(buildExfilActorsQuery(s), { ...IGNORE, enabled: !s.showExample });
  const series = useScopedDql<ResultRecord>(buildExfilTimeseriesQuery(s), { ...IGNORE, enabled: !s.showExample });
  const detail = useScopedDql<ResultRecord>(buildExfilDetailQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) {
      return {
        destinations: DEMO_EXFIL_DESTINATIONS,
        actors: DEMO_EXFIL_ACTORS,
        timeseries: DEMO_EXFIL_TIMESERIES,
        detail: DEMO_EXFIL_DETAIL,
        isLoading: false,
      };
    }
    return {
      destinations: parseExfilDestinations(recs(dest.data)),
      actors: parseExfilActors(recs(actors.data)),
      timeseries: foldGovTimeseries(recs(series.data), "calls", "category"),
      detail: parseExfilDetail(recs(detail.data)),
      isLoading: dest.isLoading || actors.isLoading || series.isLoading || detail.isLoading,
    };
  }, [s.showExample, dest.data, dest.isLoading, actors.data, actors.isLoading, series.data, series.isLoading, detail.data, detail.isLoading]);
};

export const useGovReconciliation = (s: GovScope) => {
  const recon = useScopedDql<ResultRecord>(buildReconciliationQuery(s), { ...IGNORE, enabled: !s.showExample });
  const acctRegion = useScopedDql<ResultRecord>(buildAccountRegionQuery(s), { ...IGNORE, enabled: !s.showExample });
  return useMemo(() => {
    if (s.showExample) {
      return { reconciliation: DEMO_RECONCILIATION, accountRegion: DEMO_ACCOUNT_REGION, isLoading: false };
    }
    return {
      reconciliation: parseReconciliation(recs(recon.data)),
      accountRegion: parseAccountRegion(recs(acctRegion.data)),
      isLoading: recon.isLoading || acctRegion.isLoading,
    };
  }, [s.showExample, recon.data, recon.isLoading, acctRegion.data, acctRegion.isLoading]);
};
