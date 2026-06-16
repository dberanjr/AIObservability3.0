import { useEffect, useState } from "react";
import { analyzersClient } from "@dynatrace-sdk/client-davis-analyzers";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildInvocationsSeriesQuery } from "./queries";
import { toNum } from "../../data/format";

/**
 * Davis-Intelligence forecast for the agent-invocations series — the Agents-page
 * analogue of Pulse's useTokenForecast. Takes the SAME interval the hero chart
 * uses for its historical series so the forecast buckets line up index-for-index
 * with history (the AreaChart spaces all buckets evenly by index).
 */
const ANALYZER_NAME = "dt.statistics.GenericForecastAnalyzer";
const FORECAST_HORIZON_FRACTION = 0.3;
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

export interface InvocationsForecast {
  values: number[];
  lower: number[];
  upper: number[];
  intervalSec: number;
}

export interface UseInvocationsForecastResult {
  forecast: InvocationsForecast | null;
  isLoading: boolean;
  error?: Error;
}

interface ForecastRecord {
  [field: string]: unknown;
}

const FIELDS = {
  point: ["dt.davis.forecast:point", "forecast", "yhat", "prediction"],
  lower: ["dt.davis.forecast:lower", "yhat_lower", "lower_bound", "lower"],
  upper: ["dt.davis.forecast:upper", "yhat_upper", "upper_bound", "upper"],
} as const;

const pickSeries = (
  record: ForecastRecord | undefined,
  candidates: readonly string[],
): number[] | null => {
  if (!record) return null;
  for (const key of candidates) {
    const v = record[key];
    if (Array.isArray(v)) {
      return v.map((x) => {
        const n = toNum(x);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
      });
    }
  }
  return null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

export const useInvocationsForecast = (
  enabled: boolean,
  intervalSec: number,
  historicalBuckets: number,
): UseInvocationsForecastResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const [forecast, setForecast] = useState<InvocationsForecast | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!enabled || !canQuery || intervalSec <= 0 || historicalBuckets < 4) {
      setForecast(null);
      setError(undefined);
      return;
    }

    let cancelled = false;
    const ctl = new AbortController();
    const expression = buildInvocationsSeriesQuery(
      serviceIds,
      scope.timeframe,
      intervalSec,
    );
    const forecastHorizon = Math.max(
      6,
      Math.round(historicalBuckets * FORECAST_HORIZON_FRACTION),
    );

    setLoading(true);
    setError(undefined);

    (async () => {
      try {
        let resp = await analyzersClient.executeAnalyzer({
          analyzerName: ANALYZER_NAME,
          body: {
            timeSeriesData: { expression },
            forecastHorizon,
          },
          abortSignal: ctl.signal,
        });

        if (resp.requestToken) {
          for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
            await sleep(POLL_INTERVAL_MS);
            if (cancelled) return;
            const poll = await analyzersClient.pollAnalyzerExecution({
              analyzerName: ANALYZER_NAME,
              requestToken: resp.requestToken,
            });
            if (
              poll.result.executionStatus === "COMPLETED" ||
              poll.result.executionStatus === "ABORTED"
            ) {
              resp = { result: poll.result };
              break;
            }
          }
        }

        if (resp.result.executionStatus !== "COMPLETED") {
          throw new Error("Forecast analyzer did not complete in time");
        }

        const out = resp.result.output?.[0] as Record<string, unknown> | undefined;
        const predictions = out?.timeSeriesDataWithPredictions as
          | { records?: ForecastRecord[] }
          | undefined;
        const record = predictions?.records?.[0];

        const values = pickSeries(record, FIELDS.point) ?? [];
        const lower = pickSeries(record, FIELDS.lower) ?? [];
        const upper = pickSeries(record, FIELDS.upper) ?? [];

        if (values.length === 0) {
          throw new Error("Forecast analyzer returned no prediction values");
        }

        if (cancelled) return;
        setForecast({
          values,
          lower: lower.length === values.length ? lower : values.slice(),
          upper: upper.length === values.length ? upper : values.slice(),
          intervalSec,
        });
        setError(undefined);
      } catch (err) {
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setForecast(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [
    enabled,
    canQuery,
    intervalSec,
    historicalBuckets,
    scope.timeframe.from,
    scope.timeframe.to,
    serviceIds,
  ]);

  return { forecast, isLoading, error };
};
