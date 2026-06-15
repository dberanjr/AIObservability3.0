import type { IntentKind } from "../../lib/intents";
import type { LayerKey } from "../../data/ai-layer-patterns";

export type FindingSeverity = "info" | "warning" | "critical";

export interface FindingIntent {
  label: string;
  hint?: string;
  /** Direct onClick — wins over `intent` when both are set. */
  onClick?: () => void;
  /** When set, the FindingDrawer wires onClick to dispatchIntent with the
   *  current Finding's entity. Keeps callers from re-importing intent helpers. */
  intent?: IntentKind;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  category: string;
  entity: string;
  metric: string;
  context: string;
  detail?: string;
  timestampMs?: number;
  intents?: FindingIntent[];
  /**
   * Architecture layer this finding belongs to (redesign C.5). Lets a finding
   * read as "Agent layer: reasoning loop on X" and drill out to the same place
   * the corresponding Pulse map layer routes to.
   */
  layer?: LayerKey;
}

export const DEFAULT_FINDING_INTENTS: FindingIntent[] = [
  { label: "Distributed Traces", hint: "Open this entity's spans", intent: "traces" },
  { label: "Services", hint: "Jump to the Services app", intent: "services" },
  {
    label: "Problems",
    hint: "Review active Dynatrace Intelligence problems",
    intent: "problems",
  },
  { label: "Notebooks", hint: "Pin to a Notebook for analysis", intent: "notebooks" },
];
