import { useMemo } from "react";
import { useScopedDql } from "../scope/useScopedDql";
import { buildApplicationOptionsQuery } from "./queries";

interface ApplicationRecord {
  label?: string;
}

export interface UseApplicationOptionsResult {
  options: string[];
  isLoading: boolean;
  error?: Error;
}

export const useApplicationOptions = (
  appCi: string | undefined,
): UseApplicationOptionsResult => {
  const query = appCi ? buildApplicationOptionsQuery(appCi) : "";
  const { data, isLoading, error } = useScopedDql<ApplicationRecord>(query, {
    enabled: Boolean(appCi),
    staleTime: 5 * 60_000,
  });

  const options = useMemo<string[]>(() => {
    if (!data?.records) return [];
    return data.records
      .map((r) => r.label)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }, [data]);

  return { options, isLoading, error: error ?? undefined };
};
