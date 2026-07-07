export interface UpstreamCaller {
  id: string; name: string; requests: number; errPct: number;
  p90Ms: number; p95Ms: number; throughputPerMin: number; aiServiceIds: string[];
}
export interface AiServiceNode { id: string; name: string; agents: string[]; tools: string[]; models: string[] }
export interface CallerEdge { upstreamId: string; aiServiceId: string }
export interface UpstreamGraph { callers: UpstreamCaller[]; services: AiServiceNode[]; edges: CallerEdge[] }

export type SortKey =
  | "name" | "requests" | "errPct" | "p90Ms" | "p95Ms" | "throughputPerMin" | "aiServices";

interface RedRow { svcId?: string; svc?: string; requests?: number; errors?: number; p90ns?: number; p95ns?: number }
interface EdgeRow { upstreamId?: string; upstream?: string; aiServiceId?: string; aiService?: string }
interface CompRow { svcId?: string; agents?: (string|null)[]; tools?: (string|null)[]; models?: (string|null)[] }

const clean = (a?: (string | null)[]): string[] =>
  (a ?? []).filter((s): s is string => typeof s === "string" && s.length > 0);
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const assembleUpstreamGraph = (input: {
  reds: RedRow[]; edges: EdgeRow[]; components: CompRow[]; windowMinutes: number;
}): UpstreamGraph => {
  const { reds, edges, components, windowMinutes } = input;

  // edges + caller name map
  const cleanEdges: CallerEdge[] = [];
  const callerName = new Map<string, string>();
  const aiByCaller = new Map<string, Set<string>>();
  const serviceName = new Map<string, string>();
  for (const e of edges) {
    if (!e.upstreamId || !e.aiServiceId) continue;
    cleanEdges.push({ upstreamId: e.upstreamId, aiServiceId: e.aiServiceId });
    if (e.upstream) callerName.set(e.upstreamId, e.upstream);
    if (e.aiService) serviceName.set(e.aiServiceId, e.aiService);
    if (!aiByCaller.has(e.upstreamId)) aiByCaller.set(e.upstreamId, new Set());
    aiByCaller.get(e.upstreamId)!.add(e.aiServiceId);
  }

  // callers = union of RED rows and edge sources
  const callerIds = new Set<string>([
    ...reds.map((r) => r.svcId).filter((s): s is string => !!s),
    ...cleanEdges.map((e) => e.upstreamId),
  ]);
  const redById = new Map(reds.filter((r) => r.svcId).map((r) => [r.svcId!, r]));
  const mins = windowMinutes > 0 ? windowMinutes : 1;
  const callers: UpstreamCaller[] = [...callerIds].map((id) => {
    const r = redById.get(id);
    const requests = n(r?.requests);
    const errors = n(r?.errors);
    return {
      id,
      name: r?.svc || callerName.get(id) || id,
      requests,
      errPct: requests > 0 ? (errors / requests) * 100 : 0,
      p90Ms: n(r?.p90ns) / 1_000_000,
      p95Ms: n(r?.p95ns) / 1_000_000,
      throughputPerMin: requests / mins,
      aiServiceIds: [...(aiByCaller.get(id) ?? [])],
    };
  });

  // services = dedup by id, enriched with components
  const compById = new Map(components.filter((c) => c.svcId).map((c) => [c.svcId!, c]));
  const serviceIds = new Set<string>(cleanEdges.map((e) => e.aiServiceId));
  const services: AiServiceNode[] = [...serviceIds].map((id) => {
    const c = compById.get(id);
    return {
      id, name: serviceName.get(id) || id,
      agents: clean(c?.agents), tools: clean(c?.tools), models: clean(c?.models),
    };
  });

  return { callers, services, edges: cleanEdges };
};

export const topCallersByVolume = (callers: UpstreamCaller[], count: number): Set<string> =>
  new Set([...callers].sort((a, b) => b.requests - a.requests).slice(0, count).map((c) => c.id));

export const sortCallers = (
  callers: UpstreamCaller[], key: SortKey, dir: "asc" | "desc",
): UpstreamCaller[] => {
  const mul = dir === "asc" ? 1 : -1;
  const val = (c: UpstreamCaller): number | string =>
    key === "name" ? c.name.toLowerCase()
    : key === "aiServices" ? c.aiServiceIds.length
    : (c[key] as number);
  return [...callers].sort((a, b) => {
    const av = val(a), bv = val(b);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * mul;
    return (av - bv) * mul;
  });
};
