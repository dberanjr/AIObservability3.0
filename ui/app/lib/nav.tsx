/**
 * Shared in-app tab navigation.
 *
 * The top tab bar and the Pulse architecture map must route through the SAME
 * mechanism so a map deep-link and a direct tab click land in the same place
 * and both leave the persistent top nav intact. `useTabNav` is that mechanism:
 * it preserves the current query string (timeframe ?from/?to, global filters)
 * and merges any pre-filter params a caller wants to apply.
 *
 * Pre-filter convention (read by the destination page):
 *   /agents?focus=<orchestrator|agent|tools|vectordb|memory>[&agent=<name>]
 *   /models?focus=<...>
 *   /prompts?focus=llm
 */
import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

/** Architecture-map layer keys that are navigable destinations. */
export type FocusParam =
  | "orchestrator"
  | "agent"
  | "tools"
  | "vectordb"
  | "memory"
  | "llm";

export interface TabNavParams {
  /** Pre-filter focus applied at the destination (sets ?focus=). */
  focus?: FocusParam;
  /** Optional agent pre-selection (sets ?agent=). */
  agent?: string;
  /**
   * Extra search params merged into the URL (e.g. the `pf_*` Prompts filter a
   * finding drill carries). Any prior `pf_*` params are cleared first.
   */
  params?: Record<string, string>;
}

/**
 * Returns a `goToTab(pathname, params?)` function that navigates while keeping
 * the existing search params and merging in any pre-filter. Use this for every
 * programmatic tab switch (the map, finding drill-outs, rehomed intents).
 */
export const useTabNav = (): ((
  pathname: string,
  params?: TabNavParams,
) => void) => {
  const navigate = useNavigate();
  const { search } = useLocation();
  return (pathname: string, params?: TabNavParams) => {
    const next = new URLSearchParams(search);
    if (params?.focus) next.set("focus", params.focus);
    else next.delete("focus");
    if (params?.agent) next.set("agent", params.agent);
    else next.delete("agent");
    // Clear any prior finding filter, then apply the caller's extra params.
    for (const k of [...next.keys()]) if (k.startsWith("pf_")) next.delete(k);
    if (params?.params) {
      for (const [k, v] of Object.entries(params.params)) next.set(k, v);
    }
    const qs = next.toString();
    navigate({ pathname, search: qs ? `?${qs}` : "" });
  };
};

/** Read the current `?focus=` pre-filter (or null). */
export const useFocusParam = (): FocusParam | null => {
  const { search } = useLocation();
  const v = new URLSearchParams(search).get("focus");
  return (v as FocusParam) ?? null;
};

/** Read the current `?agent=` pre-selection (or null). */
export const useAgentParam = (): string | null => {
  const { search } = useLocation();
  return new URLSearchParams(search).get("agent");
};

/**
 * <Navigate> that keeps the current query string — used by the folded-tab
 * redirects so a deep-link to /tools?from=…&to=… reaches /agents with scope
 * intact.
 */
export const RedirectKeepingSearch = ({
  to,
}: {
  to: string;
}): React.ReactElement => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
};
