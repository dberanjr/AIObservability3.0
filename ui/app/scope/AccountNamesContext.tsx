import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { httpClient } from "@dynatrace-sdk/http-client";
import { useTweaks } from "../tweaks/TweaksContext";
import { DEMO_ACCOUNT_NAMES } from "../bedrock/demoData";

/**
 * Account id -> friendly connection name, resolved from the AWS extension's
 * monitoring configurations — the same list shown at Settings > Collect and
 * capture > Cloud and virtualization > AWS > Accounts in the Dynatrace UI —
 * via GET .../extensions/v2/extensions/com.dynatrace.extension.da-aws/monitoring-configurations.
 * There is no DQL/entity source for this: `dt.entity.aws_credentials` (the
 * classic-entity view) lags real configuration changes badly — a freshly
 * added sandbox connection can take days to appear there — so this hits the
 * Extensions v2 API directly instead.
 *
 * Fetched once per app session and shared via context so every render site
 * that displays an account id reads from here rather than re-fetching. Falls
 * back to an empty map (bare-id display, unchanged from before this feature
 * existed) on any fetch error, or for an account with no matching monitoring
 * configuration (e.g. cross-account access this app's viewer can't see) —
 * `fmtAccount` degrades gracefully to the bare id either way.
 */
export interface AccountNamesContextValue {
  names: Record<string, string>;
  isLoading: boolean;
}

const AccountNamesContext = createContext<AccountNamesContextValue>({
  names: {},
  isLoading: false,
});

const EXTENSION_ID = "com.dynatrace.extension.da-aws";

interface MonitoringConfigItem {
  value?: {
    description?: string;
    aws?: { credentials?: { accountId?: string }[] };
  };
}

export const AccountNamesProvider = ({ children }: { children: React.ReactNode }) => {
  const { pageConfig } = useTweaks();
  const [names, setNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (pageConfig.demoMode) {
      setNames(DEMO_ACCOUNT_NAMES);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    httpClient
      .send({
        url: `/platform/extensions/v2/extensions/${EXTENSION_ID}/monitoring-configurations`,
        method: "GET",
      })
      .then((res) => res.body("json"))
      .then((data: { items?: MonitoringConfigItem[] }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const item of data?.items ?? []) {
          const name = item.value?.description;
          if (!name) continue;
          for (const cred of item.value?.aws?.credentials ?? []) {
            if (cred.accountId) map[cred.accountId] = name;
          }
        }
        setNames(map);
      })
      .catch(() => {
        if (!cancelled) setNames({});
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageConfig.demoMode]);

  const value = useMemo<AccountNamesContextValue>(() => ({ names, isLoading }), [names, isLoading]);

  return <AccountNamesContext.Provider value={value}>{children}</AccountNamesContext.Provider>;
};

export const useAccountNames = (): AccountNamesContextValue => useContext(AccountNamesContext);
