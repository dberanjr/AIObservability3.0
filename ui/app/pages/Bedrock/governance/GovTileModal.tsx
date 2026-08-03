import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { DetailModalShell, Section, Stat, StatGrid } from "../../../components/DetailModal";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { AreaChart } from "../../../components/charts/AreaChart";
import { StackedBarChart } from "../../../components/charts/StackedBarChart";
import { BarList, type BarListItem } from "../../../components/charts/BarList";
import { EmptyState } from "../../../components/EmptyState";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope } from "../../../bedrock/governance/types";
import type { GovTimeseries } from "../../../bedrock/governance/types";
import {
  useGovApiActions,
  useGovIdentities,
  useGovErrorsSeries,
  useGovAccessDenied,
  useExfiltration,
} from "../../../bedrock/governance/useGovernance";
import type {
  ExfilActorRow,
  ExfilDestinationRow,
  ExfilDetailRow,
} from "../../../bedrock/governance/exfiltration";

export type GovTileKind =
  | "calls"
  | "identities"
  | "sourceIps"
  | "errored"
  | "nonMfa"
  | "crossRegion";

const META: Record<GovTileKind, { title: string; subtitle: string }> = {
  calls: { title: "Bedrock API calls", subtitle: "CloudTrail activity — actions and volume over time" },
  identities: { title: "Identities", subtitle: "Who is calling Bedrock, and with what MFA posture" },
  sourceIps: { title: "Source IPs", subtitle: "Where Bedrock is being called from" },
  errored: { title: "Errored & denied calls", subtitle: "Error codes over time and who was blocked" },
  nonMfa: { title: "Non-MFA calls", subtitle: "Sessions without MFA — expected for IAM roles, a flag for humans" },
  crossRegion: { title: "Cross-region inference & data residency", subtitle: "Inference that left the requested region — and the country" },
};

// --- shared helpers ---------------------------------------------------------

const seriesFromTs = (ts: GovTimeseries) =>
  ts.series.map((s, i) => ({
    values: s.values,
    color: CATEGORICAL[i % CATEGORICAL.length],
    label: s.key,
  }));

const ticksFromLabels = (labels: string[]) => {
  const step = Math.max(1, Math.floor(labels.length / 6));
  return labels
    .map((label, index) => ({ index, label }))
    .filter((_, i) => i % step === 0);
};

const barItems = (
  rows: { key: string; label: string; value: number; secondary?: string }[],
): BarListItem[] =>
  rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    displayValue: fmtCount(r.value),
    secondary: r.secondary,
  }));

const TsChart = ({ ts, ariaLabel }: { ts: GovTimeseries; ariaLabel: string }) =>
  ts.series.length === 0 ? (
    <EmptyState bare title="No time-series data" description="Nothing in this scope." />
  ) : (
    <AreaChart
      series={seriesFromTs(ts)}
      xLabels={ts.labels}
      axisTicks={ticksFromLabels(ts.labels)}
      formatLeft={(n) => fmtCount(n)}
      height={260}
      ariaLabel={ariaLabel}
      interactiveLegend
    />
  );

// --- per-kind detail --------------------------------------------------------

const CallsDetail = ({ scope }: { scope: GovScope }) => {
  const { rows, timeseries } = useGovApiActions(scope);
  const total = rows.reduce((s, r) => s + r.calls, 0);
  const stackedSeries = timeseries.series.map((s, i) => ({
    key: s.key,
    label: s.key,
    color: CATEGORICAL[i % CATEGORICAL.length],
    values: s.values,
  }));
  return (
    <>
      <StatGrid cols={3}>
        <Stat label="Total calls" value={fmtCount(total)} emphasize />
        <Stat label="Distinct actions" value={fmtCount(rows.length)} />
        <Stat label="Top action" value={rows[0]?.eventName ?? "—"} sub={rows[0] ? fmtCount(rows[0].calls) : undefined} />
      </StatGrid>
      <Section title="Calls over time by action">
        {timeseries.series.length === 0 ? (
          <EmptyState bare title="No time-series data" description="Nothing in this scope." />
        ) : (
          <StackedBarChart
            series={stackedSeries}
            labels={timeseries.labels}
            formatValue={fmtCount}
            height={260}
            ariaLabel="Bedrock API calls over time by action"
          />
        )}
      </Section>
      <Section title="API actions">
        <BarList
          items={barItems(rows.map((r) => ({ key: r.eventName, label: r.eventName, value: r.calls })))}
          color={STATUS_COLOR.info}
          limit={12}
        />
      </Section>
    </>
  );
};

const mfaColor = (mfa: string): string =>
  mfa === "false" ? STATUS_COLOR.warning : mfa === "true" ? STATUS_COLOR.good : "var(--text-3)";

const IdentitiesDetail = ({ scope, nonMfaOnly }: { scope: GovScope; nonMfaOnly?: boolean }) => {
  const { topIdentities, identityMfa } = useGovIdentities(scope);
  const rows = nonMfaOnly ? identityMfa.filter((r) => r.mfa === "false") : identityMfa;
  const cols: DataColumn<(typeof rows)[number]>[] = [
    { key: "identity", header: "Identity/Account", render: (r) => r.identity, mono: true, width: 260, noTruncate: true },
    { key: "mfa", header: "MFA", render: (r) => <span style={{ color: mfaColor(r.mfa) }}>{r.mfa}</span>, width: 90 },
    { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 100 },
    { key: "ips", header: "Source IPs", render: (r) => fmtCount(r.sourceIps), align: "right", width: 110 },
  ];
  return (
    <>
      <StatGrid cols={3}>
        <Stat label="Identities" value={fmtCount(new Set(identityMfa.map((r) => r.identity)).size)} emphasize />
        <Stat label="Non-MFA rows" value={fmtCount(identityMfa.filter((r) => r.mfa === "false").length)} />
        <Stat label="Top identity" value={topIdentities[0]?.identity ?? "—"} sub={topIdentities[0] ? `${fmtCount(topIdentities[0].calls)} calls` : undefined} />
      </StatGrid>
      {!nonMfaOnly && (
        <Section title="Top identities by calls">
          <BarList items={barItems(topIdentities.map((r) => ({ key: r.identity, label: r.identity, value: r.calls })))} color={STATUS_COLOR.info} limit={10} />
        </Section>
      )}
      <Section title={nonMfaOnly ? "Non-MFA access by identity" : "Access by identity & MFA"}>
        <DataTable columns={cols} rows={rows} rowKey={(r, i) => `${r.identity}-${r.mfa}-${i}`} maxHeight={320} />
      </Section>
    </>
  );
};

const SourceIpsDetail = ({ scope }: { scope: GovScope }) => {
  const { topSourceIps } = useGovIdentities(scope);
  const shared = topSourceIps.filter((r) => r.identities > 1);
  const cols: DataColumn<(typeof topSourceIps)[number]>[] = [
    { key: "ip", header: "Source IP", render: (r) => r.sourceIp, mono: true, width: 200 },
    { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
    { key: "identities", header: "Identities", render: (r) => (
      <span style={{ color: r.identities > 1 ? STATUS_COLOR.warning : "var(--text)" }}>{fmtCount(r.identities)}</span>
    ), align: "right", width: 120 },
  ];
  return (
    <>
      <StatGrid cols={3}>
        <Stat label="Distinct IPs" value={fmtCount(topSourceIps.length)} emphasize />
        <Stat label="Shared IPs" value={fmtCount(shared.length)} sub="used by >1 identity" danger={shared.length > 0} />
        <Stat label="Busiest IP" value={topSourceIps[0]?.sourceIp ?? "—"} sub={topSourceIps[0] ? `${fmtCount(topSourceIps[0].calls)} calls` : undefined} />
      </StatGrid>
      <Section title="Top source IPs">
        <DataTable columns={cols} rows={topSourceIps} rowKey={(r) => r.sourceIp} maxHeight={360} />
      </Section>
    </>
  );
};

const ErroredDetail = ({ scope }: { scope: GovScope }) => {
  const { timeseries } = useGovErrorsSeries(scope);
  const { rows } = useGovAccessDenied(scope);
  const denied = rows.reduce((s, r) => s + r.deniedCalls, 0);
  const stackedSeries = timeseries.series.map((s, i) => ({
    key: s.key,
    label: s.key,
    color: CATEGORICAL[i % CATEGORICAL.length],
    values: s.values,
  }));
  const cols: DataColumn<(typeof rows)[number]>[] = [
    { key: "identity", header: "Identity/Account", render: (r) => r.identity, mono: true, width: 220, noTruncate: true },
    { key: "action", header: "Action", render: (r) => r.eventName, width: 150 },
    { key: "ip", header: "Source IP", render: (r) => r.sourceIp, mono: true, width: 150 },
    { key: "denied", header: "Denied", render: (r) => <span style={{ color: STATUS_COLOR.warning }}>{fmtCount(r.deniedCalls)}</span>, align: "right", width: 100 },
  ];
  return (
    <>
      <StatGrid cols={2}>
        <Stat label="Access-denied calls" value={fmtCount(denied)} emphasize danger={denied > 0} />
        <Stat label="Denied principals" value={fmtCount(rows.length)} />
      </StatGrid>
      <Section title="Errors & denials over time">
        {timeseries.series.length === 0 ? (
          <EmptyState bare title="No time-series data" description="Nothing in this scope." />
        ) : (
          <StackedBarChart
            series={stackedSeries}
            labels={timeseries.labels}
            formatValue={fmtCount}
            height={260}
            ariaLabel="Bedrock errors over time by error code"
          />
        )}
      </Section>
      <Section title="Access denied — who, from where, doing what">
        {rows.length === 0 ? (
          <EmptyState bare title="No access-denied events" description="No Bedrock call returned AccessDenied in this scope." />
        ) : (
          <DataTable columns={cols} rows={rows} rowKey={(r, i) => `${r.identity}-${r.eventName}-${i}`} maxHeight={320} />
        )}
      </Section>
    </>
  );
};

// --- cross-region / exfiltration (the centerpiece) --------------------------

const clientColor = (human: boolean): string => (human ? STATUS_COLOR.critical : "var(--text-2)");
const shortTime = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

const ExfilDetail = ({ scope }: { scope: GovScope }) => {
  const { destinations, actors, timeseries, detail } = useExfiltration(scope);

  const outOfCountry = destinations.reduce((s, r) => s + r.calls, 0);
  const countries = new Set(destinations.map((r) => r.destinationCountry)).size;
  const humanActors = actors.filter((a) => a.human).length;

  const destCols: DataColumn<ExfilDestinationRow>[] = [
    { key: "country", header: "Destination country", render: (r) => (
      <Flex alignItems="center" gap={6}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR.critical, flex: "0 0 auto" }} />
        {r.destinationCountry}
      </Flex>
    ), width: 220, noTruncate: true },
    { key: "route", header: "Route (req → inference)", render: (r) => `${r.region} → ${r.inferenceRegion}`, mono: true, width: 220 },
    { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 90 },
    { key: "identities", header: "Identities", render: (r) => fmtCount(r.identities), align: "right", width: 100 },
    { key: "ips", header: "IPs", render: (r) => fmtCount(r.sourceIps), align: "right", width: 80 },
    { key: "last", header: "Last seen", render: (r) => shortTime(r.lastSeen), width: 130 },
  ];

  const actorCols: DataColumn<ExfilActorRow>[] = [
    { key: "identity", header: "Identity/Account", render: (r) => r.identity, mono: true, width: 200, noTruncate: true },
    { key: "type", header: "Type", render: (r) => r.userType || "—", width: 120 },
    { key: "client", header: "Client", render: (r) => (
      <span style={{ color: clientColor(r.human), fontWeight: r.human ? 600 : 400 }}>
        {r.human ? "⚠ " : ""}{r.client}
      </span>
    ), width: 180, noTruncate: true },
    { key: "dest", header: "Countries", render: (r) => fmtCount(r.destinations), align: "right", width: 100 },
    { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 80 },
    { key: "last", header: "Last seen", render: (r) => shortTime(r.lastSeen), width: 130 },
  ];

  const detailCols: DataColumn<ExfilDetailRow>[] = [
    { key: "time", header: "Time", render: (r) => shortTime(r.timestamp), width: 130 },
    { key: "identity", header: "Identity/Account", render: (r) => r.identity, mono: true, width: 170, noTruncate: true },
    { key: "country", header: "Destination", render: (r) => r.destinationCountry, width: 190, noTruncate: true },
    { key: "route", header: "Route", render: (r) => `${r.region} → ${r.inferenceRegion}`, mono: true, width: 200 },
    { key: "client", header: "Client", render: (r) => r.client, width: 150 },
    { key: "ip", header: "Source IP", render: (r) => r.sourceIp, mono: true, width: 140 },
    { key: "event", header: "Action", render: (r) => r.eventName, width: 140 },
  ];

  return (
    <>
      <StatGrid cols={4}>
        <Stat label="Out-of-country calls" value={fmtCount(outOfCountry)} emphasize danger={outOfCountry > 0} />
        <Stat label="Destination countries" value={fmtCount(countries)} sub={destinations.map((d) => d.destinationCountry).slice(0, 3).join(", ") || undefined} />
        <Stat label="Actors" value={fmtCount(actors.length)} />
        <Stat label="Human-driven" value={fmtCount(humanActors)} sub="browser/console client" danger={humanActors > 0} />
      </StatGrid>

      {outOfCountry === 0 ? (
        <EmptyState bare title="No out-of-country inference" description="All cross-region inference in this scope stayed within the requesting country." />
      ) : (
        <>
          <Section title="Out-of-country inference over time">
            <TsChart ts={timeseries} ariaLabel="Cross-region inference over time, out-of-country vs same-country" />
          </Section>
          <Section title="Where inference went (by country)">
            <DataTable columns={destCols} rows={destinations} rowKey={(r) => r.inferenceRegion} maxHeight={260} />
          </Section>
          <Section title="Who is driving it (actors & client)">
            <DataTable columns={actorCols} rows={actors} rowKey={(r) => r.identity} maxHeight={260} />
          </Section>
          <Section title="Every out-of-country call">
            <DataTable columns={detailCols} rows={detail} rowKey={(r, i) => `${r.timestamp}-${i}`} maxHeight={300} />
          </Section>
        </>
      )}
    </>
  );
};

// --- shell ------------------------------------------------------------------

export interface GovTileModalProps {
  kind: GovTileKind;
  scope: GovScope;
  onClose: () => void;
}

export const GovTileModal = ({ kind, scope, onClose }: GovTileModalProps) => {
  const meta = META[kind];
  return (
    <DetailModalShell title={meta.title} subtitle={meta.subtitle} onClose={onClose} maxWidth={1080}>
      {kind === "calls" && <CallsDetail scope={scope} />}
      {kind === "identities" && <IdentitiesDetail scope={scope} />}
      {kind === "nonMfa" && <IdentitiesDetail scope={scope} nonMfaOnly />}
      {kind === "sourceIps" && <SourceIpsDetail scope={scope} />}
      {kind === "errored" && <ErroredDetail scope={scope} />}
      {kind === "crossRegion" && <ExfilDetail scope={scope} />}
    </DetailModalShell>
  );
};
