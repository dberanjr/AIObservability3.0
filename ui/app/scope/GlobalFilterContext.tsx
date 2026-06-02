import React, { createContext, useContext } from "react";
import { usePersistedState } from "../state/usePersistedState";

/**
 * A single free-form filter condition: a span attribute and the set of values
 * to match (OR within a condition; AND across conditions). The attribute can
 * be ANY span field — gen_ai.*, langchain.*, service.name, k8s.*, span.*, etc.
 */
export interface FilterCondition {
  attribute: string;
  values: string[];
}

export interface GlobalFilters {
  conditions: FilterCondition[];
}

interface GlobalFilterContextValue {
  filters: GlobalFilters;
  /** Add (or merge values into) a condition for an attribute. */
  upsertCondition: (attribute: string, values: string[]) => void;
  /** Replace the values of an existing condition; removes it if empty. */
  setConditionValues: (attribute: string, values: string[]) => void;
  removeCondition: (attribute: string) => void;
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

  const setConditionValues = (attribute: string, values: string[]) => {
    const others = conditions.filter((c) => c.attribute !== attribute);
    setFilters({
      conditions:
        values.length > 0 ? [...others, { attribute, values }] : others,
    });
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
      conditions: conditions.filter((c) => c.attribute !== attribute),
    });

  const clearAll = () => setFilters(EMPTY);

  const hasFilters = conditions.length > 0;

  return (
    <GlobalFilterContext.Provider
      value={{
        filters: { conditions },
        upsertCondition,
        setConditionValues,
        removeCondition,
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
