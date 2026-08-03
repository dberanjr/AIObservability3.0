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
  /**
   * True when every hook on this page should render its bundled demo
   * dataset instead of querying Grail — either the global "Demo Mode" Tweak
   * is on, or `useBedrockAvailable`'s own probe (scoped to this SAME
   * timeframe) found nothing. `BedrockPage` computes this once and threads
   * it through; optional so existing query-builder tests that construct a
   * bare `{ timeframe, accounts, models }` literal keep typechecking.
   */
  showExample?: boolean;
}
