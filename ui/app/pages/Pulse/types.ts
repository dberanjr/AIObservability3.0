export type PillarKey = "operational" | "quality" | "cost";

export type PillarStatus = "good" | "warning" | "critical" | "no-data";

export interface PillarReason {
  text: string;
  intent?: "info" | "warning" | "critical";
}

export interface PillarCta {
  label: string;
  href: string;
}

export interface Pillar {
  key: PillarKey;
  label: string;
  status: PillarStatus;
  score: number | null;
  reasons: PillarReason[];
  cta?: PillarCta;
}

export interface PulseHealth {
  operational: Pillar;
  quality: Pillar;
  cost: Pillar;
  isLoading: boolean;
  error?: Error;
  /** Re-run every underlying health query (bound to the useDql refetches). */
  refetch: () => void;
}

export const QUALITY_EVAL_SETUP_GUIDE =
  "https://docs.dynatrace.com/docs/observe/applications-and-microservices/genai/setup-evaluation-pipeline";
