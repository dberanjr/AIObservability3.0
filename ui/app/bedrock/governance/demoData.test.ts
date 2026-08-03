import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
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
  DEMO_RECONCILIATION,
  DEMO_ACCOUNT_REGION,
  DEMO_EXFIL_DESTINATIONS,
  DEMO_EXFIL_ACTORS,
  DEMO_EXFIL_TIMESERIES,
  DEMO_EXFIL_DETAIL,
} from "./demoData";

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("Governance demo dataset", () => {
  it("KPI totalCalls equals the sum of DEMO_API_ACTIONS", () => {
    expect(sum(DEMO_API_ACTIONS.map((r) => r.calls))).toBe(DEMO_GOV_KPIS.totalCalls);
  });

  it("KPI crossRegionCalls matches both DEMO_CROSS_REGION and the exfiltration timeseries independently (same population, two views)", () => {
    const crossRegionTotal = sum(DEMO_CROSS_REGION.map((r) => r.calls));
    const exfilTotal = sum(DEMO_EXFIL_TIMESERIES.series.flatMap((s) => s.values));
    expect(crossRegionTotal).toBe(DEMO_GOV_KPIS.crossRegionCalls);
    expect(exfilTotal).toBe(DEMO_GOV_KPIS.crossRegionCalls);
  });

  it("KPI erroredCalls equals the errors-timeseries total", () => {
    const errTotal = sum(DEMO_ERRORS_TIMESERIES.series.flatMap((s) => s.values));
    expect(errTotal).toBe(DEMO_GOV_KPIS.erroredCalls);
  });

  it("AccessDenied and Throttling error-series totals match the detail tables exactly", () => {
    const accessDeniedSeries = DEMO_ERRORS_TIMESERIES.series.find((s) => s.key === "AccessDenied")!;
    const throttleSeries = DEMO_ERRORS_TIMESERIES.series.find((s) => s.key === "ThrottlingException")!;
    expect(sum(accessDeniedSeries.values)).toBe(sum(DEMO_ACCESS_DENIED.map((r) => r.deniedCalls)));
    expect(sum(throttleSeries.values)).toBe(sum(DEMO_THROTTLES.map((r) => r.throttledCalls)));
  });

  it("KPI nonMfaCalls equals the mfa:false rows in DEMO_IDENTITY_MFA", () => {
    const nonMfa = sum(DEMO_IDENTITY_MFA.filter((r) => r.mfa === "false").map((r) => r.calls));
    expect(nonMfa).toBe(DEMO_GOV_KPIS.nonMfaCalls);
  });

  it("distinctAccounts matches DEMO_ACCOUNTS length", () => {
    expect(DEMO_GOV_KPIS.distinctAccounts).toBe(DEMO_ACCOUNTS.length);
  });

  it("identity/source-IP anomalous-access examples are present", () => {
    expect(DEMO_TOP_IDENTITIES.length).toBeGreaterThan(0);
    expect(DEMO_TOP_SOURCE_IPS.some((r) => r.identities > 1)).toBe(true);
    expect(DEMO_IDENTITY_MFA.some((r) => r.sourceIps > 1)).toBe(true);
  });

  it("account/region rows sum to a plausible total", () => {
    expect(DEMO_ACCOUNT_REGION.length).toBeGreaterThan(0);
    for (const r of DEMO_ACCOUNT_REGION) expect(r.calls).toBeGreaterThan(0);
  });

  it("reconciliation shows CloudTrail slightly ahead of the metering log", () => {
    const [ct, log] = DEMO_RECONCILIATION;
    expect(ct.invocations).toBeGreaterThan(log.invocations);
  });

  it("exfiltration deep-dive is internally consistent with DEMO_CROSS_REGION's residency exception", () => {
    const residencyException = DEMO_CROSS_REGION[DEMO_CROSS_REGION.length - 1];
    const exfilCalls = sum(DEMO_EXFIL_DESTINATIONS.map((r) => r.calls));
    expect(exfilCalls).toBe(residencyException.calls);
    expect(sum(DEMO_EXFIL_ACTORS.map((a) => a.calls))).toBe(exfilCalls);
    expect(DEMO_EXFIL_DETAIL.length).toBe(exfilCalls);
    expect(DEMO_EXFIL_ACTORS.some((a) => a.human)).toBe(true);
  });
});
