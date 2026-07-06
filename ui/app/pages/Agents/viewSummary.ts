import { SLOW_P90_MS } from "./constants";
import type { AgentView } from "./AgentsViewRow";

const agentsWord = (n: number): string => `${n} ${n === 1 ? "agent" : "agents"}`;

/**
 * Header summary for the agents table that reflects the active View's true
 * semantics. The Expensive / Most-used views hard-slice to the top 50, and Slow
 * uses the shared 2 s cutoff — so a bare "{n} agents" reads as a match total
 * when it's really "top N shown" or "N over threshold".
 */
export const agentsViewSummary = (view: AgentView, count: number): string => {
  switch (view) {
    case "expensive":
      return `Top ${count} by cost`;
    case "used":
      return `Top ${count} by invocations`;
    case "slow":
      return `Slow · P90 > ${SLOW_P90_MS / 1000}s · ${agentsWord(count)}`;
    case "all":
    default:
      return agentsWord(count);
  }
};
