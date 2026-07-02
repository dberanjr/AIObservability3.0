import React, { createContext, useContext, useRef } from "react";
import { usePersistedState } from "../state/usePersistedState";
import { hasActiveFilter, type GlobalFilters } from "./queries";
import { createResetHandlerRegistry } from "./resetHandlerRegistry";

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
  /**
   * Set (replace) a presence ("exists") condition keyed by `attribute`. Scopes
   * to traces where any span carries at least one of `attributeNames`
   * (OR-joined). Defaults `attributeNames` to `[attribute]`.
   */
  setPresenceCondition: (attribute: string, attributeNames?: string[]) => void;
  removeCondition: (attribute: string) => void;
  clearAll: () => void;
  hasFilters: boolean;
  /**
   * Register a side-effect to run when the global Reset is invoked. Lets pages
   * with their own local (e.g. URL-param) filter state clear themselves on
   * Reset without the shared toolbar needing to know about them. Returns an
   * unregister function — call it on unmount.
   */
  registerResetHandler: (fn: () => void) => () => void;
  /** Invoke every registered reset handler. Called by the toolbar's Reset. */
  runResetHandlers: () => void;
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

  const setPresenceCondition = (
    attribute: string,
    attributeNames?: string[],
  ) => {
    const names =
      attributeNames && attributeNames.length > 0 ? attributeNames : [attribute];
    const others = conditions.filter((c) => c.attribute !== attribute);
    setFilters({
      conditions: [...others, { attribute, values: names, op: "exists" }],
    });
  };

  const removeCondition = (attribute: string) =>
    setFilters({
      conditions: conditions.filter((c) => c.attribute !== attribute),
    });

  const clearAll = () => setFilters(EMPTY);

  // Reset-handler registry. Built once and held in a ref (stable across
  // renders) so register/run never change identity and effects that register a
  // handler don't re-run on every parent render.
  const registryRef = useRef<ReturnType<typeof createResetHandlerRegistry>>();
  if (!registryRef.current) {
    registryRef.current = createResetHandlerRegistry();
  }
  const { register: registerResetHandler, run: runResetHandlers } =
    registryRef.current;

  const normalized: GlobalFilters = { conditions };
  const hasFilters = hasActiveFilter(normalized);

  return (
    <GlobalFilterContext.Provider
      value={{
        filters: normalized,
        upsertCondition,
        setConditionValues,
        setPresenceCondition,
        removeCondition,
        clearAll,
        hasFilters,
        registerResetHandler,
        runResetHandlers,
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
