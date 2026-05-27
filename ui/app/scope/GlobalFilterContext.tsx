import React, { createContext, useContext } from "react";
import { usePersistedState } from "../state/usePersistedState";

export interface GlobalFilters {
  agents: string[];
  models: string[];
  providers: string[];
}

interface GlobalFilterContextValue {
  filters: GlobalFilters;
  setAgents: (agents: string[]) => void;
  setModels: (models: string[]) => void;
  setProviders: (providers: string[]) => void;
  clearAll: () => void;
  hasFilters: boolean;
}

const GlobalFilterContext = createContext<GlobalFilterContextValue | undefined>(undefined);

export const GlobalFilterProvider = ({ children }: { children: React.ReactNode }) => {
  const [filters, setFilters] = usePersistedState<GlobalFilters>("ai-obs.global-filters", {
    agents: [],
    models: [],
    providers: [],
  });

  const setAgents = (agents: string[]) =>
    setFilters({ ...filters, agents });

  const setModels = (models: string[]) =>
    setFilters({ ...filters, models });

  const setProviders = (providers: string[]) =>
    setFilters({ ...filters, providers });

  const clearAll = () =>
    setFilters({ agents: [], models: [], providers: [] });

  const hasFilters =
    filters.agents.length > 0 || filters.models.length > 0 || filters.providers.length > 0;

  return (
    <GlobalFilterContext.Provider
      value={{ filters, setAgents, setModels, setProviders, clearAll, hasFilters }}
    >
      {children}
    </GlobalFilterContext.Provider>
  );
};

export const useGlobalFilters = (): GlobalFilterContextValue => {
  const ctx = useContext(GlobalFilterContext);
  if (!ctx) {
    throw new Error("useGlobalFilters must be called within GlobalFilterProvider");
  }
  return ctx;
};
