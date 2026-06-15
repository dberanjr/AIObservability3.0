/**
 * Bridge from a Pulse finding (anomaly) to a Prompts page filter, so "Open in
 * Prompts" on a finding lands on the Prompts stream pre-scoped to the spans that
 * actually contributed to that problem pattern.
 *
 * The filter is encoded into `pf_*` URL params by the navigator and decoded by
 * PromptsPage on arrival. Each anomaly type maps to the Prompts filter that
 * isolates its contributing spans (truncation → onlyTruncated, runaway agent →
 * that agent, cost/latency spike → that service, rate-limit/logical → onlyErrors).
 */
import type { PromptsFilter } from "./usePrompts";

interface FindingLike {
  type?: string;
  entity?: string;
}

const PF = "pf_";
export const PF_KEYS = [
  `${PF}services`,
  `${PF}agents`,
  `${PF}models`,
  `${PF}truncated`,
  `${PF}errors`,
];

/** Anomaly entity is often "agent · service" or a bare service / "Fleet". */
const agentOf = (entity?: string): string | undefined => {
  if (!entity || entity === "Fleet") return undefined;
  const a = entity.split(" · ")[0].trim();
  return a || undefined;
};
const serviceOf = (entity?: string): string | undefined => {
  if (!entity || entity === "Fleet") return undefined;
  const parts = entity.split(" · ");
  const s = (parts[1] ?? parts[0]).trim();
  return s || undefined;
};

/** Map a finding to the Prompts filter that isolates its contributing spans. */
export const promptsFilterForFinding = (f: FindingLike): PromptsFilter => {
  switch (f.type) {
    case "truncation":
      return { onlyTruncated: true };
    case "rate-limit":
      return { onlyErrors: true };
    case "runaway-agent":
    case "within-trace-growth": {
      const a = agentOf(f.entity);
      return a ? { agents: [a] } : {};
    }
    case "cost-spike":
    case "token-surge":
    case "latency-spike": {
      const s = serviceOf(f.entity);
      return s ? { services: [s] } : {};
    }
    default:
      return {};
  }
};

/** Encode a PromptsFilter into `pf_*` URL search params. */
export const encodePromptsFilter = (f: PromptsFilter): Record<string, string> => {
  const p: Record<string, string> = {};
  if (f.services?.length) p[`${PF}services`] = f.services.join("~");
  if (f.agents?.length) p[`${PF}agents`] = f.agents.join("~");
  if (f.models?.length) p[`${PF}models`] = f.models.join("~");
  if (f.onlyTruncated) p[`${PF}truncated`] = "1";
  if (f.onlyErrors) p[`${PF}errors`] = "1";
  return p;
};

/** Decode `pf_*` URL search params back into a PromptsFilter. */
export const decodePromptsFilter = (search: string): PromptsFilter => {
  const q = new URLSearchParams(search);
  const f: PromptsFilter = {};
  const sv = q.get(`${PF}services`);
  if (sv) f.services = sv.split("~").filter(Boolean);
  const ag = q.get(`${PF}agents`);
  if (ag) f.agents = ag.split("~").filter(Boolean);
  const md = q.get(`${PF}models`);
  if (md) f.models = md.split("~").filter(Boolean);
  if (q.get(`${PF}truncated`) === "1") f.onlyTruncated = true;
  if (q.get(`${PF}errors`) === "1") f.onlyErrors = true;
  return f;
};
