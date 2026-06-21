import React, { createContext, useContext } from "react";
import { usePersistedState } from "../state/usePersistedState";
import { hasActiveFilter, type GlobalFilters } from "./queries";

// `FilterCondition` / `GlobalFilters` are defined once in `queries.ts` (the DQL
// resolver owns the shape); re-export the condition type for existing importers
// of this module.
export type { FilterCondition, GlobalFilters } from "./queries";

interface GlobalFilterContextValue {
  filters: GlobalFilters;
  /** Add (or merge values into) a condition for an attribute. */
  upsertCondition: (attribute: string, values: string[]) => void;
  /** Replace the values of an existing condition; removes it if empty. */
  setConditionValues: (attribute: string, values: string[]) => void;
  removeCondition: (attribute: string) => void;
  /**
   * Toggle a framework LABEL on/off in the `frameworks` dimension (selecting a
   * chip filters the whole page; clicking it again clears it).
   */
  toggleFramework: (label: string) => void;
  clearAll: () => void;
  hasFilters: boolean;
}

const GlobalFilterContext = createContext<GlobalFilterContextValue | undefined>(
  undefined,
);

const EMPTY: GlobalFilters = { conditions: [] };

export const GlobalFilterProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Persisted under a new key so the old fixed-category shape doesn't
  // deserialize into the new conditions model.
  const [filters, setFilters] = usePersistedState<GlobalFilters>(
    "ai-obs.global-filters.v2",
    EMPTY,
  );

  const conditions = filters.conditions ?? [];
  const frameworks = filters.frameworks ?? [];

  const setConditionValues = (attribute: string, values: string[]) => {
    const others = conditions.filter((c) => c.attribute !== attribute);
    setFilters({
      ...filters,
      conditions:
        values.length > 0 ? [...others, { attribute, values }] : others,
    });
  };

  const toggleFramework = (label: string) => {
    const next = frameworks.includes(label)
      ? frameworks.filter((l) => l !== label)
      : [...frameworks, label];
    setFilters({ ...filters, frameworks: next });
  };

  const upsertCondition = (attribute: string, values: string[]) => {
    const existing = conditions.find((c) => c.attribute === attribute);
    const merged = existing
      ? Array.from(new Set([...existing.values, ...values]))
      : values;
    setConditionValues(attribute, merged);
  };

  const removeCondition = (attribute: string) =>
    setFilters({
      ...filters,
      conditions: conditions.filter((c) => c.attribute !== attribute),
    });

  const clearAll = () => setFilters(EMPTY);

  const normalized: GlobalFilters = { conditions, frameworks };
  const hasFilters = hasActiveFilter(normalized);

  return (
    <GlobalFilterContext.Provider
      value={{
        filters: normalized,
        upsertCondition,
        setConditionValues,
        removeCondition,
        toggleFramework,
        clearAll,
        hasFilters,
      }}
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
