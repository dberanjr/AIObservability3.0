import React, { useEffect, useRef } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import {
  useTweaks,
  type Accent,
  type ChartStyle,
  type Density,
  type Theme,
  type TileStyle,
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

interface SwitchProps {
  ariaLabel: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const Switch = ({ ariaLabel, checked, onChange }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    style={{
      all: "unset",
      cursor: "pointer",
      width: 42,
      height: 24,
      borderRadius: 999,
      background: checked ? "var(--green-2)" : "var(--text-4)",
      position: "relative",
      transition: "background 120ms ease",
      flex: "0 0 auto",
    }}
  >
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: 2,
        left: checked ? 20 : 2,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        transition: "left 120ms ease",
      }}
    />
  </button>
);

const THEME_OPTIONS: SegmentOption<Theme>[] = [
  { value: "light", label: "light" },
  { value: "dark", label: "dark" },
];
const DENSITY_OPTIONS: SegmentOption<Density>[] = [
  { value: "comfortable", label: "comfortable" },
  { value: "compact", label: "compact" },
];
const TILE_OPTIONS: SegmentOption<TileStyle>[] = [
  { value: "card", label: "card" },
  { value: "bordered", label: "bordered" },
  { value: "ghost", label: "ghost" },
];
const ACCENT_OPTIONS: SegmentOption<Accent>[] = [
  { value: "blue", label: "blue" },
  { value: "purple", label: "purple" },
];
const CHART_STYLE_OPTIONS: SegmentOption<ChartStyle>[] = [
  { value: "line", label: "line" },
  { value: "area", label: "area" },
  { value: "gradient", label: "gradient" },
];

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
        width: 340,
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

            <Flex alignItems="center" justifyContent="space-between">
              <FieldLabel>Left rail</FieldLabel>
              <Switch
                ariaLabel="Toggle left rail"
                checked={t.leftRail}
                onChange={t.setLeftRail}
              />
            </Flex>
          </Flex>

          <Flex flexDirection="column" gap={12}>
            <SectionLabel>Color & Charts</SectionLabel>

            <Flex flexDirection="column" gap={6}>
              <FieldLabel>Accent</FieldLabel>
              <Segmented
                ariaLabel="Accent color"
                options={ACCENT_OPTIONS}
                value={t.accent}
                onChange={t.setAccent}
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
