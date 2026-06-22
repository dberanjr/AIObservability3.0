import type { ExplorerSummary } from "./useExplorerSummary";

/**
 * Element ids of the page sections that count tiles scroll to. Threaded onto a
 * wrapping <div id=…> around each CollapsibleCard in ExplorerPage so a tile can
 * `scrollIntoView` without holding a React ref to the (lazily-mounted) card.
 */
export const SECTION_IDS = {
  heatmap: "explorer-section-heatmap",
  servicesTable: "explorer-section-services",
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

/**
 * The highest-volume service name, used by the Concentration tile to filter to
 * the dominant service. Sourced from the summary's `topServiceShare` (computed
 * as max-by-tokens in useExplorerSummary), falling back to null when there is
 * no traffic.
 */
export const topServiceName = (summary: ExplorerSummary): string | null =>
  summary.topServiceShare?.service ?? null;

/** A tile either adds a global filter condition or scrolls to a page section. */
export type TileAction =
  | { kind: "filter"; attribute: string; values: string[]; aria: string }
  | { kind: "scroll"; section: SectionId; aria: string }
  | { kind: "none" };

/**
 * Map a tile id to the action it performs on click. Pure so it can be unit
 * tested without rendering. `none` is returned when a filter has no usable
 * target (e.g. concentration with no top service), so the caller renders the
 * tile as non-interactive.
 */
export const tileAction = (
  id:
    | "aiServices"
    | "llmRequests"
    | "tokens"
    | "activeModels"
    | "concentration"
    | "errors"
    | "logicalErrors",
  summary: ExplorerSummary,
): TileAction => {
  switch (id) {
    case "aiServices":
      return {
        kind: "scroll",
        section: SECTION_IDS.servicesTable,
        aria: "Scroll to the AI services table",
      };
    case "llmRequests":
      return {
        kind: "scroll",
        section: SECTION_IDS.servicesTable,
        aria: "Scroll to the AI services table (per-service requests)",
      };
    case "tokens":
      return {
        kind: "scroll",
        section: SECTION_IDS.servicesTable,
        aria: "Scroll to the AI services table (per-service tokens)",
      };
    case "activeModels":
      return {
        kind: "scroll",
        section: SECTION_IDS.heatmap,
        aria: "Scroll to the service × model heatmap",
      };
    case "concentration": {
      const top = topServiceName(summary);
      return top
        ? {
            kind: "filter",
            attribute: "service.name",
            values: [top],
            aria: `Filter to the top service, ${top}`,
          }
        : { kind: "none" };
    }
    case "errors":
      return {
        kind: "filter",
        attribute: "span.status_code",
        values: ["error"],
        aria: "Filter to errored requests",
      };
    case "logicalErrors":
      // Logical errors are a computed multi-signal rule (LOGICAL_ERROR_EXPR),
      // not a single span attribute, so there is no clean predicate to filter
      // on — scroll to the services table, which has a per-service logical-error
      // column instead.
      return {
        kind: "scroll",
        section: SECTION_IDS.servicesTable,
        aria: "Scroll to the AI services table (per-service logical errors)",
      };
  }
};
