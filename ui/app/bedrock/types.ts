import type { Timeframe } from "../scope/types";

export interface BedrockScope {
  timeframe: Timeframe;
  /** Selected AWS account ids; empty = all. */
  accounts: string[];
  /** Selected raw Bedrock modelIds (as logged, NOT normalizeBedrockModelId-
   *  collapsed); empty = all. `ScopeSelectors` sources these from
   *  `useBedrockFacets`, and `bedrockLogBase` filters `b[modelId]` against
   *  them directly, so they must round-trip as the raw log field values. */
  models: string[];
}
