export type ResetHandler = () => void;

export interface ResetHandlerRegistry {
  /** Register a handler; returns an unregister function. */
  register: (fn: ResetHandler) => () => void;
  /** Invoke every currently-registered handler. */
  run: () => void;
}

/**
 * A tiny set-backed registry of reset side-effects. Pages with local filter
 * state (e.g. URL params) register a handler so the global Reset can clear them
 * without the shared toolbar knowing about each page. Pure + framework-free so
 * it is trivially unit-testable; React holds one instance in a ref.
 */
export const createResetHandlerRegistry = (): ResetHandlerRegistry => {
  const handlers = new Set<ResetHandler>();
  return {
    register: (fn) => {
      handlers.add(fn);
      return () => {
        handlers.delete(fn);
      };
    },
    run: () => {
      for (const fn of handlers) fn();
    },
  };
};
