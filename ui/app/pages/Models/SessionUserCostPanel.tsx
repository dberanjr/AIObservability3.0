/**
 * Session- and user-level cost rollup (redesign F.3).
 *
 * The multi-turn cost view the memory/history patterns imply: effective cost
 * and billable tokens per session and per user, costed through the section-G
 * cache-aware model. Capability-gated on `session.id` AND `gen_ai.user` — when
 * either is absent (the case on both validation tenants today) it renders an
 * EmptyState explaining that session/user cost needs identity plus proxy trace
 * propagation, rather than a fabricated table.
 */
import React, { useMemo } from "react";
import { Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { useCapability } from "../../scope/CapabilityContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { dqlTimeArg, scopeFilterClause } from "../../scope/queries";
import { costOf } from "../../data/pricing";
import { canonicalizeModel } from "../../detection/attributes";
import { fmtUSD, fmtCount } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ExampleDataFrame } from "../../components/displayHints";

interface SessionRecord {
  session?: string | null;
  user?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  requests?: number;
  models?: Array<string | null>;
}

interface RollupRow {
  key: string;
  session: string;
  user: string;
  cost: number;
  billableTokens: number;
  requests: number;
  model: string;
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Per session+user: token sums, request count, dominant model. */
const buildSessionCostQuery = (
  serviceIds: string[] | null,
  from: string,
  to: string,
): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
${scopeFilterClause(serviceIds)}
| filter isNotNull(\`session.id\`) and isNotNull(\`gen_ai.user\`) and isNotNull(\`gen_ai.request.model\`)
| summarize {
    input_tokens = sum(toLong(\`gen_ai.usage.input_tokens\`)),
    output_tokens = sum(toLong(\`gen_ai.usage.output_tokens\`)),
    requests = count(),
    models = collectDistinct(\`gen_ai.request.model\`)
  }, by: { session = \`session.id\`, user = \`gen_ai.user\` }
| sort requests desc
| limit 100
`.trim();

const SessionUserCostInner = () => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const { data, isLoading } = useScopedDql<SessionRecord>(
    canQuery
      ? buildSessionCostQuery(
          serviceIds,
          scope.timeframe.from,
          scope.timeframe.to ?? "now()",
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const rows = useMemo<RollupRow[]>(() => {
    return (data?.records ?? []).map((r, i) => {
      const rawModels = (r.models ?? []).filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      const inTok = num(r.input_tokens) * samplingRatio;
      const outTok = num(r.output_tokens) * samplingRatio;
      return {
        key: `${r.session ?? "?"}-${r.user ?? "?"}-${i}`,
        session: r.session ?? "(none)",
        user: r.user ?? "(none)",
        cost: costOf(inTok, outTok, rawModels[0]),
        billableTokens: inTok + outTok,
        requests: num(r.requests) * samplingRatio,
        model: rawModels[0] ? canonicalizeModel(rawModels[0]).label : "—",
      };
    });
  }, [data, samplingRatio]);

  if (isLoading) return null;
  if (rows.length === 0)
    return (
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        No session/user activity in the current scope.
      </Text>
    );

  return (
    <Surface>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-3)" }}>
            <th style={{ padding: "6px 8px" }}>Session</th>
            <th style={{ padding: "6px 8px" }}>User</th>
            <th style={{ padding: "6px 8px" }}>Model</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Requests</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>
              Billable tokens
            </th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>
              Effective cost
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--surface-3)" }}>
              <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>
                {r.session}
              </td>
              <td style={{ padding: "6px 8px" }}>{r.user}</td>
              <td style={{ padding: "6px 8px" }}>{r.model}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                {fmtCount(r.requests)}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                {fmtCount(r.billableTokens)}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                {fmtUSD(r.cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Surface>
  );
};

/** Static synthetic rows so users can see the shape of this view. */
const EXAMPLE_ROWS: RollupRow[] = [
  { key: "e1", session: "sess_8f2a…", user: "u_204", model: "Claude Sonnet 4.6", requests: 42, billableTokens: 318_400, cost: 1.27 },
  { key: "e2", session: "sess_b13c…", user: "u_117", model: "GPT-4o", requests: 28, billableTokens: 196_200, cost: 0.84 },
  { key: "e3", session: "sess_4d90…", user: "u_204", model: "Claude Haiku 4.5", requests: 61, billableTokens: 142_750, cost: 0.19 },
];

const ExampleTable = () => (
  <Surface>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--text-3)" }}>
          <th style={{ padding: "6px 8px" }}>Session</th>
          <th style={{ padding: "6px 8px" }}>User</th>
          <th style={{ padding: "6px 8px" }}>Model</th>
          <th style={{ padding: "6px 8px", textAlign: "right" }}>Requests</th>
          <th style={{ padding: "6px 8px", textAlign: "right" }}>Billable tokens</th>
          <th style={{ padding: "6px 8px", textAlign: "right" }}>Effective cost</th>
        </tr>
      </thead>
      <tbody>
        {EXAMPLE_ROWS.map((r) => (
          <tr key={r.key} style={{ borderTop: "1px solid var(--surface-3)" }}>
            <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)" }}>{r.session}</td>
            <td style={{ padding: "6px 8px" }}>{r.user}</td>
            <td style={{ padding: "6px 8px" }}>{r.model}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtCount(r.requests)}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtCount(r.billableTokens)}</td>
            <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtUSD(r.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Surface>
);

export const SessionUserCostPanel = () => {
  const cap = useCapability();
  const { pageConfig } = useTweaks();
  const status = cap.status("sessionUser");

  if (status === "present") return <SessionUserCostInner />;
  if (cap.isLoading) return null;

  // Capability absent — show example data when the toggle is on, else explain.
  if (pageConfig.showExampleData) {
    return (
      <ExampleDataFrame attribute="session.id / gen_ai.user">
        <ExampleTable />
      </ExampleDataFrame>
    );
  }

  return (
    <EmptyState
      bare
      title="Session & user cost needs identity propagation"
      description={
        <>
          Per-session and per-user cost attribution requires both{" "}
          <code>session.id</code> and <code>gen_ai.user</code> on the LLM spans.
          Neither is emitted in this scope
          {status === "unknown" ? " within the current scan budget" : ""}.
        </>
      }
      hint="Propagate a session/user identity from the gateway through the proxy onto the GenAI spans (trace propagation), then this rolls cost and billable tokens up per session and per user."
    />
  );
};
