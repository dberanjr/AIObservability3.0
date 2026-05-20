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
const FORECAST_BUCKETS = 240;

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

export interface TokenForecast {
  /**
   * Forecast values aligned to the chart's existing index space. The hook
   * pads the leading positions with `null` so the forecast appears only on
   * the right edge of the chart.
   */
  values: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
  /** Index in the combined series where forecast begins (== historical length). */
  forecastStartIdx: number;
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
 * The analyzer response carries the forecasted timeseries inside a record
 * that may use a few different field-name conventions depending on the
 * analyzer version. Look for the first array-typed field we recognise.
 */
const pickSeries = (
  record: ForecastRecord | undefined,
  candidates: string[],
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
    const intervalSec = Math.max(60, Math.floor(totalMs / FORECAST_BUCKETS / 1000));
    const expression = buildTokenSeriesQuery(
      serviceIds,
      scope.timeframe,
      intervalSec,
    );

    setLoading(true);
    setError(undefined);

    (async () => {
      try {
        let resp = await analyzersClient.executeAnalyzer({
          analyzerName: ANALYZER_NAME,
          body: { timeSeriesData: { expression } },
          abortSignal: ctl.signal,
        });

        // Long-running executions return a token; poll until COMPLETED.
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

        // The analyzer's output is a loose AnalyzerData map — the forecast
        // payload lives at output[0].timeSeriesDataWithPredictions.records[0].
        const out = resp.result.output?.[0] as Record<string, unknown> | undefined;
        const predictions = out?.timeSeriesDataWithPredictions as
          | { records?: ForecastRecord[] }
          | undefined;
        const record = predictions?.records?.[0];

        // Field name variants observed across analyzer versions.
        const forecastValues =
          pickSeries(record, [
            "dt.davis.forecast:point_forecast",
            "forecast",
            "yhat",
            "prediction",
          ]) ?? [];
        const lower =
          pickSeries(record, [
            "dt.davis.forecast:lower",
            "yhat_lower",
            "lower_bound",
            "lower",
          ]) ?? [];
        const upper =
          pickSeries(record, [
            "dt.davis.forecast:upper",
            "yhat_upper",
            "upper_bound",
            "upper",
          ]) ?? [];
        // Historical input the analyzer used — needed so the forecast aligns
        // visually with the chart's existing token series.
        const historical =
          pickSeries(record, ["dt.davis.forecast:input", "value", "values"]) ??
          [];

        if (forecastValues.length === 0) {
          throw new Error(
            "Forecast analyzer returned no prediction values",
          );
        }

        const histLen = historical.length;
        const total = histLen + forecastValues.length;
        const pad = (n: number, source: number[]): (number | null)[] => {
          const out = new Array<number | null>(n).fill(null);
          for (let i = 0; i < source.length; i++) {
            out[histLen + i] = source[i];
          }
          return out;
        };

        if (cancelled) return;
        setForecast({
          values: pad(total, forecastValues),
          lower: pad(total, lower),
          upper: pad(total, upper),
          forecastStartIdx: histLen,
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
