import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { usePersistedState } from "../state/usePersistedState";

/** Available scan-limit options, in GB. */
export const SCAN_LIMITS_GB = [500, 1000, 2000, 5000] as const;
export type ScanLimitGb = (typeof SCAN_LIMITS_GB)[number];

export const DEFAULT_SCAN_LIMIT_GB: ScanLimitGb = 500;

export const SCAN_LIMIT_LABELS: Record<ScanLimitGb, string> = {
  500: "500 GB",
  1000: "1 TB",
  2000: "2 TB",
  5000: "5 TB",
};

export interface ScanLimitContextValue {
  scanLimitGb: ScanLimitGb;
  setScanLimit: (next: ScanLimitGb) => void;
}

const ScanLimitContext = createContext<ScanLimitContextValue | null>(null);

export const ScanLimitProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [scanLimitGb, setScanLimitGb] = usePersistedState<ScanLimitGb>(
    "ai-obs.scan-limit-gb",
    DEFAULT_SCAN_LIMIT_GB,
  );

  const setScanLimit = useCallback(
    (next: ScanLimitGb) => setScanLimitGb(next),
    [setScanLimitGb],
  );

  const value = useMemo<ScanLimitContextValue>(
    () => ({ scanLimitGb, setScanLimit }),
    [scanLimitGb, setScanLimit],
  );

  return (
    <ScanLimitContext.Provider value={value}>
      {children}
    </ScanLimitContext.Provider>
  );
};

export const useScanLimit = (): ScanLimitContextValue => {
  const ctx = useContext(ScanLimitContext);
  if (!ctx) {
    throw new Error(
      "useScanLimit must be used within a ScanLimitProvider",
    );
  }
  return ctx;
};
