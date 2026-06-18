import React, { useEffect, useRef } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import {
  useTweaks,
  type Accent,
  type ChartCurve,
  type ChartLabels,
  type ChartStyle,
  type ColorBlindFilter,
  type Density,
  type Theme,
  type TileStyle,
  type ToolsMode,
  type TraceMatchCap,
} from "./TweaksContext";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--text-3)",
    }}
  >
    {children}
  </Text>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
    {children}
  </Text>
);

interface SegmentOption<V extends string> {
  value: V;
  label: string;
}

interface SegmentedProps<V extends string> {
  ariaLabel: string;
  options: SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
}

const Segmented = <V extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedProps<V>) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      padding: 2,
      gap: 2,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 999,
    }}
  >
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.value)}
          style={{
            all: "unset",
            cursor: "pointer",
            textAlign: "center",
            padding: "6px 0",
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            color: active ? "var(--text)" : "var(--text-2)",
            background: active ? "var(--surface)" : "transparent",
            boxShadow: active ? "var(--shadow, 0 1px 2px rgba(0,0,0,0.06))" : "none",
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

interface AccentSwatchesProps {
  value: Accent;
  customHex: string;
  onChange: (v: Accent) => void;
  onCustomChange: (hex: string) => void;
}

/**
 * Row of colour swatches for the Accent tweak. Each swatch is a round
 * button; the selected one gets a ring outline. The last swatch is a
 * "custom" picker — clicking it opens the browser's color picker so the
 * user can choose any hex value.
 */
const Swatch = ({
  accent,
  active,
  onChange,
}: {
  accent: Exclude<Accent, "custom">;
  active: boolean;
  onChange: (a: Accent) => void;
}) => {
  const swatch = ACCENT_SWATCH[accent];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={accent}
      title={accent}
      onClick={() => onChange(accent)}
      style={{
        all: "unset",
        cursor: "pointer",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: swatch,
        boxShadow: active
          ? `0 0 0 2px var(--surface), 0 0 0 4px ${swatch}`
          : "0 1px 2px rgba(0,0,0,0.08)",
      }}
    />
  );
};

const AccentSwatches = ({
  value,
  customHex,
  onChange,
  onCustomChange,
}: AccentSwatchesProps) => (
  <div
    role="radiogroup"
    aria-label="Accent color"
    style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}
  >
    {ACCENT_GROUPS.map((group, groupIdx) => (
      <React.Fragment key={group.label}>
        {groupIdx > 0 && (
          <span
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: "var(--border)",
              margin: "0 2px",
              flex: "0 0 auto",
            }}
          />
        )}
        {group.accents.map((a) => (
          <Swatch
            key={a}
            accent={a}
            active={a === value}
            onChange={onChange}
          />
        ))}
      </React.Fragment>
    ))}
    {/* Separator before the custom picker. */}
    <span
      aria-hidden
      style={{
        width: 1,
        height: 18,
        background: "var(--border)",
        margin: "0 2px",
        flex: "0 0 auto",
      }}
    />
    {/* Custom-color swatch + invisible native color input layered over it. */}
    <label
      title="Custom color"
      aria-label="Custom color"
      style={{
        position: "relative",
        width: 26,
        height: 26,
        borderRadius: "50%",
        cursor: "pointer",
        background:
          "conic-gradient(from 180deg at 50% 50%, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
        boxShadow:
          value === "custom"
            ? `0 0 0 2px var(--surface), 0 0 0 4px ${customHex}`
            : "0 1px 2px rgba(0,0,0,0.08)",
        display: "inline-block",
        flex: "0 0 auto",
      }}
    >
      <input
        type="color"
        value={customHex}
        onChange={(e) => {
          onCustomChange(e.target.value);
          if (value !== "custom") onChange("custom");
        }}
        onClick={() => {
          // Switch to custom on first click so picking a color is a single
          // gesture instead of requiring a separate "custom" tap first.
          if (value !== "custom") onChange("custom");
        }}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
          border: 0,
          padding: 0,
          width: "100%",
          height: "100%",
        }}
        aria-label="Pick custom accent color"
      />
    </label>
  </div>
);

const THEME_OPTIONS: SegmentOption<Theme>[] = [
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
];
const DENSITY_OPTIONS: SegmentOption<Density>[] = [
  { value: "comfortable", label: "comfortable" },
  { value: "compact", label: "compact" },
  { value: "minimal", label: "minimal" },
];
const TILE_OPTIONS: SegmentOption<TileStyle>[] = [
  { value: "card", label: "card" },
  { value: "bordered", label: "bordered" },
  { value: "ghost", label: "ghost" },
];
/**
 * Accents grouped by color family so the swatch row reads naturally:
 * blues / purples / greens / warms / greys, with `custom` always at the
 * end. Renders with a small visual gap between groups.
 */
const ACCENT_GROUPS: Array<{ label: string; accents: Exclude<Accent, "custom">[] }> = [
  { label: "Blues",   accents: ["blue", "cyan", "teal", "indigo"] },
  { label: "Purples", accents: ["purple", "purpleDeep", "pink"] },
  { label: "Greens",  accents: ["green", "lime"] },
  { label: "Warm",    accents: ["amber", "red"] },
  { label: "Grays",   accents: ["gray25", "gray50", "gray75", "black"] },
];
const ACCENT_OPTIONS: SegmentOption<Accent>[] = [
  ...ACCENT_GROUPS.flatMap((g) =>
    g.accents.map((a) => ({ value: a, label: a })),
  ),
];
const COLORBLIND_OPTIONS: SegmentOption<ColorBlindFilter>[] = [
  { value: "none", label: "off" },
  { value: "protanopia", label: "protanopia" },
  { value: "deuteranopia", label: "deuteranopia" },
  { value: "tritanopia", label: "tritanopia" },
  { value: "achromatopsia", label: "grayscale" },
];
const CHART_STYLE_OPTIONS: SegmentOption<ChartStyle>[] = [
  { value: "line", label: "line" },
  { value: "area", label: "area" },
  { value: "gradient", label: "gradient" },
];
const CHART_CURVE_OPTIONS: SegmentOption<ChartCurve>[] = [
  { value: "linear", label: "linear" },
  { value: "smooth", label: "smooth" },
];
const CHART_LABELS_OPTIONS: SegmentOption<ChartLabels>[] = [
  { value: "none", label: "none" },
  { value: "peak", label: "peak" },
  { value: "minmax", label: "min/max" },
  { value: "interesting", label: "interesting" },
  { value: "all", label: "periodic" },
];

const TOOLS_MODE_OPTIONS: SegmentOption<ToolsMode>[] = [
  { value: "strict", label: "Strict" },
  { value: "discovered", label: "Discovered" },
];

const ON_OFF_OPTIONS: SegmentOption<"on" | "off">[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

const TRACE_CAP_OPTIONS: SegmentOption<TraceMatchCap>[] = [
  { value: "fast", label: "Fast · 5k" },
  { value: "balanced", label: "Balanced · 25k" },
  { value: "exact", label: "Exact" },
];

/**
 * Accent options render as colour swatches so users can preview the
 * mapping. Hex pulled from `theme/tokens.ts` brand palette.
 */
const ACCENT_SWATCH: Record<Exclude<Accent, "custom">, string> = {
  blue: "#1C5BE5",
  purple: "#B23BE4",
  cyan: "#54C8E9",
  green: "#73BE28",
  pink: "#E436FF",
  amber: "#B45F06",
  red: "#C0291E",
  indigo: "#4635D6",
  lime: "#BDDF28",
  teal: "#0EA5A5",
  purpleDeep: "#6C3AD6",
  gray25: "#bfbfbf",
  gray50: "#808080",
  gray75: "#404040",
  black: "#000000",
};

export const TweaksPanel = () => {
  const t = useTweaks();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Click outside or Esc closes the panel.
  useEffect(() => {
    if (!t.isPanelOpen) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Ignore clicks on the trigger button itself; the header handler will
        // toggle and re-open otherwise. The button is outside the panel, so
        // we look for the data-attribute it carries.
        const target = e.target as HTMLElement;
        if (target.closest("[data-aiobs-tweaks-trigger]")) return;
        t.closePanel();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") t.closePanel();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [t.isPanelOpen, t]);

  if (!t.isPanelOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Tweaks"
      style={{
        position: "fixed",
        top: 64,
        right: 16,
        // Wide enough that the grouped accent swatches + 5 value-label
        // segments each fit on a single line without wrapping.
        width: 560,
        maxHeight: "calc(100vh - 96px)",
        overflowY: "auto",
        zIndex: 1000,
      }}
    >
      <Surface
        elevation="raised"
        padding={20}
        style={{ borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}
      >
        <Flex flexDirection="column" gap={16}>
          <Flex alignItems="center" justifyContent="space-between">
            <Heading level={3} style={{ fontSize: 18, fontWeight: 700 }}>
              Tweaks
            </Heading>
            <button
              type="button"
              aria-label="Close tweaks"
              onClick={t.closePanel}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 6,
                fontSize: 18,
                lineHeight: 1,
                color: "var(--text-3)",
              }}
            >
              ×
            </button>
          </Flex>

          <Flex flexDirection="column" gap={12}>
            <SectionLabel>Appearance</SectionLabel>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Theme</FieldLabel>
              <Segmented
                ariaLabel="Theme"
                options={THEME_OPTIONS}
                value={t.theme}
                onChange={t.setTheme}
              />
            </Flex>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Density</FieldLabel>
              <Segmented
                ariaLabel="Density"
                options={DENSITY_OPTIONS}
                value={t.density}
                onChange={t.setDensity}
              />
            </Flex>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Tile style</FieldLabel>
              <Segmented
                ariaLabel="Tile style"
                options={TILE_OPTIONS}
                value={t.tileStyle}
                onChange={t.setTileStyle}
              />
            </Flex>

          </Flex>

          <Flex flexDirection="column" gap={12}>
            <SectionLabel>Color & Charts</SectionLabel>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Accent</FieldLabel>
              <AccentSwatches
                value={t.accent}
                customHex={t.customAccent}
                onChange={t.setAccent}
                onCustomChange={t.setCustomAccent}
              />
            </Flex>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Chart style</FieldLabel>
              <Segmented
                ariaLabel="Chart style"
                options={CHART_STYLE_OPTIONS}
                value={t.chartStyle}
                onChange={t.setChartStyle}
              />
            </Flex>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Curve</FieldLabel>
              <Segmented
                ariaLabel="Chart curve"
                options={CHART_CURVE_OPTIONS}
                value={t.chartCurve}
                onChange={t.setChartCurve}
              />
            </Flex>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Value labels</FieldLabel>
              <Segmented
                ariaLabel="Chart value labels"
                options={CHART_LABELS_OPTIONS}
                value={t.chartLabels}
                onChange={t.setChartLabels}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" gap={12}>
            <SectionLabel>Accessibility</SectionLabel>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Color-blindness filter</FieldLabel>
              <Segmented
                ariaLabel="Colorblind filter"
                options={COLORBLIND_OPTIONS}
                value={t.colorBlindFilter}
                onChange={t.setColorBlindFilter}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" gap={12}>
            <SectionLabel>Page configuration</SectionLabel>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Agent tools · definition</FieldLabel>
              <Segmented
                ariaLabel="Tools mode"
                options={TOOLS_MODE_OPTIONS}
                value={t.pageConfig.toolsMode}
                onChange={t.setToolsMode}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                Strict counts only spans with{" "}
                <code>gen_ai.tool.name</code>. Discovered treats MCP / internal
                function spans (by span name) as tools.
              </Text>
            </Flex>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Agents tab · TTFT column</FieldLabel>
              <Segmented
                ariaLabel="Show TTFT column"
                options={ON_OFF_OPTIONS}
                value={t.pageConfig.agentsShowTtft ? "on" : "off"}
                onChange={(v) => t.setAgentsShowTtft(v === "on")}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                Off by default —{" "}
                <code>gen_ai.response.ttft</code> is not
                instrumented in this environment.
              </Text>
            </Flex>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Show with example data</FieldLabel>
              <Segmented
                ariaLabel="Show example data"
                options={ON_OFF_OPTIONS}
                value={t.pageConfig.showExampleData ? "on" : "off"}
                onChange={(v) => t.setShowExampleData(v === "on")}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                Render capability-gated panels with example data when your
                telemetry doesn&apos;t emit the attribute, so you can see what
                you&apos;re missing. Example data is clearly labelled and never
                mixed with real data.
              </Text>
            </Flex>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Model names</FieldLabel>
              <Segmented
                ariaLabel="Model name display"
                options={ON_OFF_OPTIONS}
                value={t.pageConfig.showRawModels ? "on" : "off"}
                onChange={(v) => t.setShowRawModels(v === "on")}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                On shows the RAW model string (e.g.{" "}
                <code>us.anthropic.claude-…-v1:0</code>); off shows the
                normalized label (version suffixes folded).
              </Text>
            </Flex>
            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Global filter · trace cap</FieldLabel>
              <Segmented
                ariaLabel="Global filter trace cap"
                options={TRACE_CAP_OPTIONS}
                value={t.pageConfig.traceMatchCap}
                onChange={t.setTraceMatchCap}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                The global filter resolves matching <code>trace.id</code>s once
                and scopes every query to them. This caps how many traces are
                injected — <strong>Fast</strong> (5k) is snappiest,{" "}
                <strong>Balanced</strong> (25k) is the default, and{" "}
                <strong>Exact</strong> never truncates (but a very broad filter
                can fail). Truncated results are flagged as approximate.
              </Text>
            </Flex>
          </Flex>

          <Flex justifyContent="flex-end">
            <button
              type="button"
              onClick={t.resetTweaks}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-3)",
                textDecoration: "underline",
              }}
            >
              Reset to defaults
            </button>
          </Flex>
        </Flex>
      </Surface>
    </div>
  );
};
