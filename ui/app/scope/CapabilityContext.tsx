/**
 * Attribute-capability detection.
 *
 * Runs ONE scoped DQL probe that counts, across the active scope, how many AI
 * spans carry each wired capability attribute (see detection/attributeFields).
 * Feature panels call `useCapability().has(id)` and render only when coverage
 * is > 0 — so a panel lights up automatically the moment its instrumentation
 * starts arriving in the tenant, with no code change and no redeploy.
 *
 * The probe is a single summarize over a broad AI-span population, so it's
 * cheap (one query app-wide) and honours timeframe, scan limit, sampling,
 * segments, and the global attribute filter via useScopedDql like everything
 * else. Presence is taken from the raw count (> 0); ratios are reported against
 * the probed population for context, not extrapolated (a boolean gate doesn't
 * need sampling correction).
 */

import React, { createContext, useContext, useMemo } from "react";
import { useScopedDql } from "./useScopedDql";
import { useScope } from "./ScopeContext";
import { dqlTimeArg } from "./queries";
import { toNum } from "../data/format";
import {
  AI_SPAN_POPULATION,
  CAPABILITIES,
  type CapabilityId,
} from "../detection/attributeFields";

interface ProbeRecord {
  total?: number | string;
  [key: string]: number | string | undefined;
}

export interface CapabilityContextValue {
  /** True once at least one AI span carries the capability's attribute(s). */
  has: (id: CapabilityId) => boolean;
  /** Spans carrying the capability (raw, sampling-uncorrected). */
  spans: (id: CapabilityId) => number;
  /** Share of the probed AI-span population carrying it (0..1). */
  ratio: (id: CapabilityId) => number;
  /** Ids whose coverage is > 0 in the current scope. */
  present: CapabilityId[];
  isLoading: boolean;
  error?: Error;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const buildProbeQuery = (from: string, to: string): string => {
  const counters = CAPABILITIES.map(
    (c) => `    cap_${c.id} = countIf(${c.predicate})`,
  ).join(",\n");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}, scanLimitGBytes: 500
| filter ${AI_SPAN_POPULATION}
| summarize {
    total = count(),
${counters}
  }
`.trim();
};

export const CapabilityProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { scope } = useScope();
  const tf = scope.timeframe;
  const query = useMemo(
    () => buildProbeQuery(tf.from, tf.to ?? "now()"),
    [tf.from, tf.to],
  );

  const result = useScopedDql<ProbeRecord>(query, { staleTime: 60_000 });

  const record = result.data?.records?.[0] ?? undefined;
  // Stable signature so the memo recomputes only when the probe values change.
  const recordSig = JSON.stringify(record ?? null);

  const value = useMemo<CapabilityContextValue>(() => {
    const total = num(record?.total);
    const spansOf = (id: CapabilityId): number => num(record?.[`cap_${id}`]);
    const present = CAPABILITIES.filter((c) => spansOf(c.id) > 0).map(
      (c) => c.id,
    );
    return {
      has: (id) => spansOf(id) > 0,
      spans: spansOf,
      ratio: (id) => (total > 0 ? Math.min(1, spansOf(id) / total) : 0),
      present,
      isLoading: result.isLoading,
      error: result.error ?? undefined,
    };
    // record is read via recordSig; result.isLoading/error are primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordSig, result.isLoading, result.error]);

  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  );
};

export const useCapability = (): CapabilityContextValue => {
  const ctx = useContext(CapabilityContext);
  if (!ctx) {
    throw new Error("useCapability must be used within a CapabilityProvider");
  }
  return ctx;
};
