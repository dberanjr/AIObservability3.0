import { describe, expect, it } from "vitest";
import {
  regionCountry,
  classifyUserAgent,
  parseExfilDestinations,
  parseExfilActors,
  parseExfilDetail,
  buildExfilByDestinationQuery,
  buildExfilTimeseriesQuery,
} from "./exfiltration";

const scope = { timeframe: { from: "now()-7d", to: "now()" }, accounts: [] as string[] };

describe("regionCountry", () => {
  it("maps known regions to country + place", () => {
    expect(regionCountry("us-east-1")).toBe("United States (N. Virginia)");
    expect(regionCountry("ap-northeast-2")).toBe("South Korea (Seoul)");
    expect(regionCountry("ap-southeast-4")).toBe("Australia (Melbourne)");
    expect(regionCountry("eu-west-1")).toBe("Ireland");
  });
  it("falls back to the continent for unmapped regions", () => {
    expect(regionCountry("ap-unknown-9")).toBe("Asia Pacific");
    expect(regionCountry("xx-nowhere-1")).toBe("Unknown");
  });
});

describe("classifyUserAgent", () => {
  it("flags a browser UA as human", () => {
    const c = classifyUserAgent("Mozilla/5.0 (Macintosh) AppleWebKit Chrome/149 Safari/537.36");
    expect(c.human).toBe(true);
    expect(c.label).toBe("Browser / console");
  });
  it("treats SDK/CLI agents as non-human", () => {
    expect(classifyUserAgent("aws-sdk-java/2.20").human).toBe(false);
    expect(classifyUserAgent("Boto3/1.34 Python/3.12").human).toBe(false);
  });
  it("handles empty / unknown", () => {
    expect(classifyUserAgent("").label).toBe("Unknown");
  });
});

describe("parseExfilDestinations", () => {
  it("maps the inference region to a destination country", () => {
    const rows = parseExfilDestinations([
      { region: "us-east-1", inferenceRegion: "ap-northeast-2", calls: "1", identities: "1", sourceIps: "1", firstSeen: "t1", lastSeen: "t2" },
    ]);
    expect(rows[0].destinationCountry).toBe("South Korea (Seoul)");
    expect(rows[0].calls).toBe(1);
  });
});

describe("parseExfilActors", () => {
  it("classifies the actor's client and human flag", () => {
    const rows = parseExfilActors([
      { identity_name: "E475677", calls: "2", destinations: "2", sourceIps: "1", userType: "AssumedRole", userAgent: "Mozilla/5.0 Chrome/149", lastSeen: "t" },
    ]);
    expect(rows[0].identity).toBe("E475677");
    expect(rows[0].human).toBe(true);
    expect(rows[0].client).toBe("Browser / console");
  });
});

describe("parseExfilDetail", () => {
  it("resolves destination country per raw call row", () => {
    const rows = parseExfilDetail([
      { timestamp: "t", identity_name: "E475677", sourceIp: "170.85.7.5", userAgent: "Mozilla Chrome", region: "us-east-1", inferenceRegion: "ap-southeast-4", eventName: "ConverseStream" },
    ]);
    expect(rows[0].destinationCountry).toBe("Australia (Melbourne)");
    expect(rows[0].client).toBe("Browser / console");
  });
});

describe("exfil query builders", () => {
  it("filter to out-of-country (differing region family) with an account scope", () => {
    const q = buildExfilByDestinationQuery({ ...scope, accounts: ["975049911737"] });
    expect(q).toContain("reqFam != infFam");
    expect(q).toContain('in(accountId, array("975049911737"))');
  });
  it("splits the timeline into out-of-country vs same-country", () => {
    const q = buildExfilTimeseriesQuery(scope);
    expect(q).toContain('"Out-of-country"');
    expect(q).toContain("makeTimeseries");
  });
});
