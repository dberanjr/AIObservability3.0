/**
 * Friendly tenant labelling.
 *
 * We derive the tenant from the platform environment URL (getEnvironmentUrl),
 * NOT window.location.hostname. When the app is served it runs on an opaque
 * per-app sandbox alias such as
 *   usj7…--nic55601--alias.prod10.apps.dynatrace.com
 * which is meaningless to a human. The environment URL is the real tenant
 * (e.g. https://ualpre.apps.dynatrace.com), so it yields a clean label.
 */

import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

const envHost = (): string => {
  try {
    return new URL(getEnvironmentUrl()).hostname;
  } catch {
    return "";
  }
};

/** Human-friendly tenant name, e.g. "United nonprod" / "United production". */
export const tenantLabel = (): string => {
  const host = envHost();
  if (host.startsWith("ualpre")) return "United nonprod";
  if (host.startsWith("ual.") || host.startsWith("ual-")) return "United production";
  const first = host.split(".")[0];
  // Avoid surfacing an opaque sandbox alias; fall back to a neutral label.
  return first && first.length > 0 && first.length <= 24 ? first : "Dynatrace";
};

/** The tenant environment URL (clean), for "powered by" links. */
export const tenantUrl = (): string => {
  try {
    return getEnvironmentUrl();
  } catch {
    return "#";
  }
};
