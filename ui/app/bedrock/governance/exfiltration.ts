import type { GovScope } from "./types";
import { govBase } from "./queries";
import { toNum } from "../../data/format";
import { pickChartIntervalSec } from "../../scope/chartInterval";

/**
 * Cross-region / data-residency deep-dive — the detail behind the "Cross-region"
 * KPI tile and the Data-Residency card. Answers "is inference leaving the
 * country, who is doing it, from where, and with what client?" so a regulated
 * customer can reason about data-sovereignty exposure.
 *
 * "Out of country" is approximated by the AWS region GEOGRAPHY family (us / eu /
 * ap / …) differing between the requested region and the actual inference
 * region — precise when requests originate from a single geography (as here,
 * all from us-east-1). Intra-family cross-country routes (e.g. ap-northeast →
 * ap-southeast) are not separately flagged. Validated on fifththird-preprod.
 */

/** govBase + the extra CloudTrail fields this deep-dive needs, restricted to
 *  cross-region calls (inferenceRegion present and != requested region). */
const exfilBase = (s: GovScope): string =>
  `${govBase(s)}
| fieldsAdd userAgent = ct[userAgent], userType = ct[userIdentity][type]
| fieldsAdd reqFam = arrayFirst(splitString(region, "-")), infFam = arrayFirst(splitString(inferenceRegion, "-"))
| filter isNotNull(inferenceRegion) and inferenceRegion != region`;

const OUT_OF_COUNTRY = `| filter reqFam != infFam`;

export const buildExfilByDestinationQuery = (s: GovScope): string =>
  `${exfilBase(s)}
${OUT_OF_COUNTRY}
| summarize calls = count(), identities = countDistinct(identity_name), sourceIps = countDistinct(sourceIp), firstSeen = takeMin(timestamp), lastSeen = takeMax(timestamp), by: { region, inferenceRegion }
| sort calls desc`;

export const buildExfilActorsQuery = (s: GovScope): string =>
  `${exfilBase(s)}
${OUT_OF_COUNTRY}
| summarize calls = count(), destinations = countDistinct(inferenceRegion), sourceIps = countDistinct(sourceIp), userAgent = takeFirst(userAgent), userType = takeFirst(userType), lastSeen = takeMax(timestamp), by: { identity_name }
| sort calls desc
| limit 50`;

/** All cross-region calls over time, split into out-of-country vs same-country
 *  so a rising out-of-country line is obvious against the (benign) same-country
 *  baseline. */
export const buildExfilTimeseriesQuery = (s: GovScope): string =>
  `${exfilBase(s)}
| fieldsAdd category = if(reqFam != infFam, "Out-of-country", else: "Same-country cross-region")
| makeTimeseries calls = count(), interval: ${pickChartIntervalSec(s.timeframe.from)}s, by: { category }`;

export const buildExfilDetailQuery = (s: GovScope): string =>
  `${exfilBase(s)}
${OUT_OF_COUNTRY}
| sort timestamp desc
| fields timestamp, identity_name, sourceIp, userAgent, region, inferenceRegion, eventName
| limit 100`;

// --- region → country -------------------------------------------------------

interface Place {
  country: string;
  place?: string;
}

const REGION_COUNTRY: Record<string, Place> = {
  "us-east-1": { country: "United States", place: "N. Virginia" },
  "us-east-2": { country: "United States", place: "Ohio" },
  "us-west-1": { country: "United States", place: "N. California" },
  "us-west-2": { country: "United States", place: "Oregon" },
  "ca-central-1": { country: "Canada", place: "Central" },
  "eu-west-1": { country: "Ireland" },
  "eu-west-2": { country: "United Kingdom", place: "London" },
  "eu-west-3": { country: "France", place: "Paris" },
  "eu-central-1": { country: "Germany", place: "Frankfurt" },
  "eu-central-2": { country: "Switzerland", place: "Zurich" },
  "eu-north-1": { country: "Sweden", place: "Stockholm" },
  "eu-south-1": { country: "Italy", place: "Milan" },
  "eu-south-2": { country: "Spain" },
  "ap-northeast-1": { country: "Japan", place: "Tokyo" },
  "ap-northeast-2": { country: "South Korea", place: "Seoul" },
  "ap-northeast-3": { country: "Japan", place: "Osaka" },
  "ap-southeast-1": { country: "Singapore" },
  "ap-southeast-2": { country: "Australia", place: "Sydney" },
  "ap-southeast-3": { country: "Indonesia", place: "Jakarta" },
  "ap-southeast-4": { country: "Australia", place: "Melbourne" },
  "ap-south-1": { country: "India", place: "Mumbai" },
  "ap-south-2": { country: "India", place: "Hyderabad" },
  "sa-east-1": { country: "Brazil", place: "São Paulo" },
  "af-south-1": { country: "South Africa", place: "Cape Town" },
  "me-south-1": { country: "Bahrain" },
  "me-central-1": { country: "United Arab Emirates" },
};

const FAMILY_CONTINENT: Record<string, string> = {
  us: "United States",
  ca: "Canada",
  eu: "Europe",
  ap: "Asia Pacific",
  sa: "South America",
  af: "Africa",
  me: "Middle East",
};

/** Human-readable country (+ place) for an AWS region, with a continent-level
 *  fallback for regions not in the map. */
export const regionCountry = (region: string): string => {
  const hit = REGION_COUNTRY[region];
  if (hit) return hit.place ? `${hit.country} (${hit.place})` : hit.country;
  const fam = region.split("-")[0];
  return FAMILY_CONTINENT[fam] ?? "Unknown";
};

// --- user-agent classification ----------------------------------------------

export interface UaClass {
  label: string;
  /** True when the client looks like an interactive human (browser/console). */
  human: boolean;
}

/** Classify a CloudTrail userAgent into a coarse client type. A browser UA on a
 *  Bedrock call means a person driving it interactively (console / a web app) —
 *  the strongest "human data left the country" signal. */
export const classifyUserAgent = (ua: string): UaClass => {
  const s = (ua ?? "").toLowerCase();
  if (!s) return { label: "Unknown", human: false };
  if (/aws-sdk|boto3|botocore|aws-cli|amazon-coral|awscli/.test(s))
    return { label: "AWS SDK / CLI", human: false };
  if (/mozilla|chrome|safari|firefox|edg\//.test(s))
    return { label: "Browser / console", human: true };
  if (/python|node|java|go-http|okhttp|axios|curl/.test(s))
    return { label: "SDK / runtime", human: false };
  return { label: "Other", human: false };
};

// --- parsing ----------------------------------------------------------------

type Rec = Record<string, unknown>;
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const n = (v: unknown): number => {
  const x = toNum(v);
  return Number.isFinite(x) ? x : 0;
};

export interface ExfilDestinationRow {
  region: string;
  inferenceRegion: string;
  destinationCountry: string;
  calls: number;
  identities: number;
  sourceIps: number;
  firstSeen: string;
  lastSeen: string;
}

export const parseExfilDestinations = (records: Rec[]): ExfilDestinationRow[] =>
  records
    .map((r) => ({
      region: str(r.region),
      inferenceRegion: str(r.inferenceRegion),
      destinationCountry: regionCountry(str(r.inferenceRegion)),
      calls: n(r.calls),
      identities: n(r.identities),
      sourceIps: n(r.sourceIps),
      firstSeen: str(r.firstSeen),
      lastSeen: str(r.lastSeen),
    }))
    .filter((r) => r.inferenceRegion !== "");

export interface ExfilActorRow {
  identity: string;
  calls: number;
  destinations: number;
  sourceIps: number;
  userType: string;
  userAgent: string;
  client: string;
  human: boolean;
  lastSeen: string;
}

export const parseExfilActors = (records: Rec[]): ExfilActorRow[] =>
  records.map((r) => {
    const ua = str(r.userAgent);
    const cls = classifyUserAgent(ua);
    return {
      identity: str(r.identity_name),
      calls: n(r.calls),
      destinations: n(r.destinations),
      sourceIps: n(r.sourceIps),
      userType: str(r.userType),
      userAgent: ua,
      client: cls.label,
      human: cls.human,
      lastSeen: str(r.lastSeen),
    };
  });

export interface ExfilDetailRow {
  timestamp: string;
  identity: string;
  sourceIp: string;
  userAgent: string;
  client: string;
  region: string;
  inferenceRegion: string;
  destinationCountry: string;
  eventName: string;
}

export const parseExfilDetail = (records: Rec[]): ExfilDetailRow[] =>
  records.map((r) => {
    const ua = str(r.userAgent);
    return {
      timestamp: str(r.timestamp),
      identity: str(r.identity_name),
      sourceIp: str(r.sourceIp),
      userAgent: ua,
      client: classifyUserAgent(ua).label,
      region: str(r.region),
      inferenceRegion: str(r.inferenceRegion),
      destinationCountry: regionCountry(str(r.inferenceRegion)),
      eventName: str(r.eventName),
    };
  });
