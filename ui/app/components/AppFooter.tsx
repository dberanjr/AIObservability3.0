import React from "react";
import { getAppVersion } from "@dynatrace-sdk/app-environment";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";

const APP_NAME = "AI Observability 3.0 App";
const VERSION_FALLBACK = "dev";

/**
 * Persistent footer pinned to the bottom of every page. The version is read
 * from the deployed app manifest via `getAppVersion()`; outside the Dynatrace
 * JS runtime it falls back to "dev" rather than spamming the placeholder
 * sentinel the SDK returns.
 */
export const AppFooter = () => {
  const raw = getAppVersion();
  const version =
    raw === "dt.missing.app.version" || !raw ? VERSION_FALLBACK : raw;

  return (
    <Flex
      justifyContent="center"
      alignItems="center"
      style={{
        padding: "8px 20px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}
    >
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        {APP_NAME} - Version {version}
      </Text>
    </Flex>
  );
};
