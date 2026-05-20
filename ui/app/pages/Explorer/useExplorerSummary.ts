import { useMemo } from "react";
import type { AIService } from "./useAIServices";

export interface ExplorerSummary {
  aiServiceCount: number;
  llmRequests: number;
  tokens: number;
  activeModels: number;
  concentrationPct: number;
  errors: number;
  logicalErrors: number;
  topServiceShare: { service: string; pct: number } | null;
}

export const useExplorerSummary = (services: AIService[]): ExplorerSummary => {
  return useMemo<ExplorerSummary>(() => {
    const llmRequests = services.reduce((acc, s) => acc + s.requests, 0);
    const tokens = services.reduce((acc, s) => acc + s.tokens, 0);
    const errors = services.reduce((acc, s) => acc + s.errors, 0);
    const logicalErrors = services.reduce((acc, s) => acc + s.logicalErrors, 0);
    const allModels = new Set<string>();
    for (const s of services) for (const m of s.modelDisplay) allModels.add(m);

    const sorted = [...services].sort((a, b) => b.tokens - a.tokens);
    const top = sorted[0];
    const concentrationPct =
      top && tokens > 0 ? (top.tokens / tokens) * 100 : 0;

    return {
      aiServiceCount: services.length,
      llmRequests,
      tokens,
      activeModels: allModels.size,
      concentrationPct,
      errors,
      logicalErrors,
      topServiceShare:
        top && tokens > 0
          ? { service: top.service, pct: concentrationPct }
          : null,
    };
  }, [services]);
};
