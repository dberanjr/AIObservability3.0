import { useEffect, useState } from "react";
import { analyzersClient } from "@dynatrace-sdk/client-davis-analyzers";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildTokenSeriesQuery } from "./dataQueries";
import { toNum } from "../../data/format";

const ANALYZER_NAME = "dt.statistics.GenericForecastAnalyzer";

/**
 * Buckets for the forecast input. Higher = finer-grained history fed to the
 * analyzer. We don't honour the user's samplingRatio here — a forecast over
 * 1-in-10000 sampled data would be noise. The forecast always reads
 * unsampled data (the DQL builder already declares `samplingRatio: 1`).
 */
const FORECAST_INPUT_BUCKETS = 240;

/**
 * Number of forecast buckets to request from the analyzer. Sized as a fraction
 * of the historical bucket count so the predicted window is proportional to
 * the timeframe the user is currently viewing — predicting 6h ahead of a 24h
 * window, 2h ahead of an 8h window, etc.
 */
const FORECAST_HORIZON_FRACTION = 0.3;

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

export interface TokenForecast {
  /** Predicted points, one per bucket. */
  values: number[];
  /** Lower confidence-band values, same length as `values`. */
  lower: number[];
  /** Upper confidence-band values, same length as `values`. */
  upper: number[];
  /**
   * Bucket interval in seconds. Useful so the chart can extend its x-axis
   * with forecast positions spaced identically to the historical ones.
   */
  intervalSec: number;
}

export interface UseTokenForecastResult {
  forecast: TokenForecast | null;
  isLoading: boolean;
  error?: Error;
}

interface ForecastRecord {
  [field: string]: unknown;
}

const parseScopeMs = (from: string): number => {
  const m = /now\(\)\s*-\s*(\d+)([mhd])/i.exec(from);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
};

/**
 * Per the docs the analyzer record carries these exact keys. We also probe a
 * few legacy variants in case the analyzer version on a tenant predates the
 * `dt.davis.forecast:*` convention.
 */
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
        return Number.isFinite(n) ? n : 0;
      });
    }
  }
  return null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

export const useTokenForecast = (enabled: boolean): UseTokenForecastResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const [forecast, setForecast] = useState<TokenForecast | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!enabled || !canQuery) {
      setForecast(null);
      setError(undefined);
      return;
    }

    let cancelled = false;
    const ctl = new AbortController();
    const totalMs = parseScopeMs(scope.timeframe.from);
    const intervalSec = Math.max(
      60,
      Math.floor(totalMs / FORECAST_INPUT_BUCKETS / 1000),
    );
    const expression = buildTokenSeriesQuery(
      serviceIds,
      scope.timeframe,
      intervalSec,
    );
    const forecastHorizon = Math.max(
      6,
      Math.round(FORECAST_INPUT_BUCKETS * FORECAST_HORIZON_FRACTION),
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
          throw new Error(
            "Forecast analyzer returned no prediction values",
          );
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
  }, [enabled, canQuery, scope.timeframe.from, scope.timeframe.to, serviceIds]);

  return { forecast, isLoading, error };
};
