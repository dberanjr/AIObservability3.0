import { useMemo } from "react";
import { useScopedDql } from "../scope/useScopedDql";
import { APPCI_OPTIONS_QUERY } from "./queries";

interface AppCiRecord {
  applicationci?: string;
}

export interface UseAppCiOptionsResult {
  options: string[];
  isLoading: boolean;
  error?: Error;
}

export const useAppCiOptions = (): UseAppCiOptionsResult => {
  const { data, isLoading, error } = useScopedDql<AppCiRecord>(APPCI_OPTIONS_QUERY, {
    staleTime: 5 * 60_000,
  });

  const options = useMemo<string[]>(() => {
    if (!data?.records) return [];
    return data.records
      .map((r) => r.applicationci)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }, [data]);

  return { options, isLoading, error: error ?? undefined };
};
