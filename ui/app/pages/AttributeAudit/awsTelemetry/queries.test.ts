import { describe, expect, it } from "vitest";
import { buildPopulationSectionQuery, buildMetricSectionQuery, buildAwsTelemetrySectionQuery } from "./queries";
import { AWS_TELEMETRY_SECTIONS } from "./catalog";

const timeframe = { from: "now()-7d", to: "now()" };

const logsSection = AWS_TELEMETRY_SECTIONS.find((s) => s.kind === "logs")!;
const metricsSection = AWS_TELEMETRY_SECTIONS.find((s) => s.kind === "metrics")!;
const eventsSection = AWS_TELEMETRY_SECTIONS.find((s) => s.kind === "events")!;

describe("buildPopulationSectionQuery", () => {
  it("fetches logs with the prefilter before the parse step for the Model Invocation Logs section", () => {
    const q = buildPopulationSectionQuery(logsSection, timeframe);
    expect(q).toContain("fetch logs");
    const prefilterIdx = q.indexOf("dt.da.aws.log_group");
    const parseIdx = q.indexOf('parse content, "JSON:b"');
    expect(prefilterIdx).toBeGreaterThan(-1);
    expect(prefilterIdx).toBeLessThan(parseIdx);
    expect(q).toContain("section_rows = count()");
    expect(q).toContain("a0 = countIf(isNotNull(b[accountId]))");
  });

  it("fetches events and applies the postfilter AFTER the parse step for the Access & Governance section", () => {
    const q = buildPopulationSectionQuery(eventsSection, timeframe);
    expect(q).toContain("fetch events");
    const parseIdx = q.indexOf('parse data, "JSON:ct"');
    const postfilterIdx = q.indexOf('ct[eventSource] == "bedrock.amazonaws.com"');
    expect(parseIdx).toBeGreaterThan(-1);
    expect(postfilterIdx).toBeGreaterThan(parseIdx);
  });

  it("honors the passed timeframe, not a hardcoded window", () => {
    const q = buildPopulationSectionQuery(logsSection, { from: "now()-30d", to: "now()-7d" });
    expect(q).toContain("from: now()-30d, to: now()-7d");
  });
});

describe("buildMetricSectionQuery", () => {
  it("builds a scalar timeseries counter per metric field, with no population/parse step", () => {
    const q = buildMetricSectionQuery(metricsSection, timeframe);
    expect(q).toContain("timeseries {");
    expect(q).not.toContain("fetch");
    expect(q).not.toContain("parse");
    expect(q).toContain("a0 = count(`cloud.aws.bedrock.Invocations.By.ModelId`, scalar: true)");
  });
});

describe("buildAwsTelemetrySectionQuery", () => {
  it("dispatches logs/events sections to the population builder and metrics sections to the metric builder", () => {
    expect(buildAwsTelemetrySectionQuery(logsSection, timeframe)).toContain("fetch logs");
    expect(buildAwsTelemetrySectionQuery(eventsSection, timeframe)).toContain("fetch events");
    expect(buildAwsTelemetrySectionQuery(metricsSection, timeframe)).toContain("timeseries {");
  });
});
