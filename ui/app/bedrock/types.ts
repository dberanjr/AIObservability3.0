import type { Timeframe } from "../scope/types";

export interface BedrockScope {
  timeframe: Timeframe;
  /** Selected AWS account ids; empty = all. */
  accounts: string[];
  /** Selected normalized model keys; empty = all. */
  models: string[];
}
