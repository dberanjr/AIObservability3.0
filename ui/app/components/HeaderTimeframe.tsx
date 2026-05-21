import React from "react";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { useScope } from "../scope/ScopeContext";

/**
 * Top-right timeframe selector that mirrors the standard Dynatrace app
 * placement. Bridges Strato's TimeframeSelector (which works in `Timeframe`
 * objects whose `from`/`to` are TimeValue records) to our string-based
 * Scope.Timeframe.
 *
 * Stepper is on by default in the Strato component, giving us the prev/next
 * arrows the user expects.
 */
export const HeaderTimeframe = () => {
  const { scope, setTimeframe } = useScope();

  return (
    <TimeframeSelector
      value={{
        from: scope.timeframe.from,
        to: scope.timeframe.to ?? "now()",
      }}
      onChange={(next) => {
        if (!next) return;
        setTimeframe({
          from: next.from.value,
          to: next.to.value,
        });
      }}
    />
  );
};
