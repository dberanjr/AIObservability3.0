/**
 * Deep-link to a service entity's detail page. Route pattern isolated here so
 * call sites never hardcode it. NOTE: verify the exact classic-services route
 * against the running platform during implementation (Task 10) and adjust the
 * PATH constant only — the signature/tests stay stable.
 */
const PATH = "/ui/apps/dynatrace.classic.services/ui/entity/";

export const smartscapeEntityUrl = (
  entityId: string,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string => (entityId ? `${origin}${PATH}${entityId}` : "");
