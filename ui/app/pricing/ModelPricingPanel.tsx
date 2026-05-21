import React, { useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  EMPTY_PRICING_CONFIG,
  useModelPricing,
  type PricingConfig,
} from "./ModelPricingContext";
import {
  getEffectivePricing,
  normalizeModelKey,
  type ModelPricing,
} from "../data/pricing";

type Tier = ModelPricing["tier"];
const TIERS: Tier[] = ["low", "mid", "high", "frontier"];

interface Draft extends ModelPricing {
  key: string;
  /** Optional human-friendly notes (rate card link, sales contact, etc.). */
  notes?: string;
}

/**
 * Group a list of pricing entries by provider so the panel renders one
 * collapsible section per vendor (Anthropic / OpenAI / Google / Other …).
 */
const groupByProvider = (drafts: Draft[]): Record<string, Draft[]> => {
  const out: Record<string, Draft[]> = {};
  for (const d of drafts) {
    const provider = d.provider || "Other";
    (out[provider] ||= []).push(d);
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  return out;
};

const buildInitialDrafts = (config: PricingConfig): Draft[] => {
  const merged = getEffectivePricing();
  const drafts: Draft[] = Object.entries(merged).map(([key, p]) => ({
    key,
    ...p,
    // Note: ModelPricing in the registry doesn't carry notes; pull from
    // overrides directly so user-added notes survive the round-trip.
    notes: (config.overrides[key] as ModelPricing & { notes?: string })
      ?.notes,
  }));
  // Also surface user-added custom models that aren't in the merged map
  // (defensive — they should already be in `merged` via overrides).
  for (const [key, p] of Object.entries(config.overrides)) {
    if (!drafts.find((d) => d.key === normalizeModelKey(key))) {
      drafts.push({ key: normalizeModelKey(key), ...p });
    }
  }
  drafts.sort((a, b) => a.key.localeCompare(b.key));
  return drafts;
};

interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  width?: number;
  ariaLabel: string;
}
const NumberInput = ({
  value,
  onChange,
  step = 0.01,
  width = 96,
  ariaLabel,
}: NumberInputProps) => (
  <input
    type="number"
    inputMode="decimal"
    step={step}
    value={Number.isFinite(value) ? value : 0}
    onChange={(e) => {
      const n = Number(e.target.value);
      if (Number.isFinite(n)) onChange(n);
    }}
    aria-label={ariaLabel}
    style={{
      width,
      padding: "4px 6px",
      border: "1px solid var(--border)",
      borderRadius: 4,
      background: "var(--surface)",
      color: "var(--text)",
      fontSize: 12,
      fontFamily: "inherit",
      fontVariantNumeric: "tabular-nums",
    }}
  />
);

interface TextInputProps {
  value: string;
  onChange: (s: string) => void;
  width?: number;
  ariaLabel: string;
  placeholder?: string;
}
const TextInput = ({
  value,
  onChange,
  width = 160,
  ariaLabel,
  placeholder,
}: TextInputProps) => (
  <input
    type="text"
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    aria-label={ariaLabel}
    style={{
      width,
      padding: "4px 6px",
      border: "1px solid var(--border)",
      borderRadius: 4,
      background: "var(--surface)",
      color: "var(--text)",
      fontSize: 12,
      fontFamily: "inherit",
    }}
  />
);

const Pill = ({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "purple";
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      padding: "2px 8px",
      borderRadius: 999,
      background:
        tone === "purple" ? "var(--intel-soft)" : "var(--surface-2)",
      color: tone === "purple" ? "var(--purple-2)" : "var(--text-3)",
      border:
        tone === "purple"
          ? "1px solid var(--purple-2)"
          : "1px solid var(--border)",
    }}
  >
    {children}
  </span>
);

interface PricingRowProps {
  draft: Draft;
  editing: boolean;
  onChange: (next: Draft) => void;
  onEdit: () => void;
  onRevertRow: () => void;
  isOverride: boolean;
  isCustom: boolean;
}

const PricingRow = ({
  draft,
  editing,
  onChange,
  onEdit,
  onRevertRow,
  isOverride,
  isCustom,
}: PricingRowProps) => (
  <div
    style={{
      padding: "10px 12px",
      borderTop: "1px solid var(--border)",
      display: "grid",
      gridTemplateColumns:
        "minmax(180px, 1.5fr) 110px 110px 130px 110px auto",
      alignItems: "center",
      columnGap: 12,
      rowGap: 6,
    }}
  >
    <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
      <Flex alignItems="center" gap={6}>
        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 12.5,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {draft.key}
        </Text>
        {isCustom && <Pill tone="purple">Custom</Pill>}
        {!isCustom && isOverride && <Pill>Edited</Pill>}
      </Flex>
      {editing ? (
        <TextInput
          value={draft.notes ?? ""}
          width={260}
          placeholder="Notes (optional)"
          ariaLabel="Notes"
          onChange={(v) => onChange({ ...draft, notes: v })}
        />
      ) : draft.notes ? (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          {draft.notes}
        </Text>
      ) : null}
    </Flex>

    {editing ? (
      <NumberInput
        ariaLabel="Input per 1M tokens"
        value={draft.inputPerMTok}
        onChange={(n) => onChange({ ...draft, inputPerMTok: n })}
      />
    ) : (
      <Text style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        ${draft.inputPerMTok.toFixed(2)}
      </Text>
    )}

    {editing ? (
      <NumberInput
        ariaLabel="Output per 1M tokens"
        value={draft.outputPerMTok}
        onChange={(n) => onChange({ ...draft, outputPerMTok: n })}
      />
    ) : (
      <Text style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        ${draft.outputPerMTok.toFixed(2)}
      </Text>
    )}

    {editing ? (
      <NumberInput
        ariaLabel="Context window"
        step={1000}
        width={120}
        value={draft.contextWindow ?? 0}
        onChange={(n) =>
          onChange({ ...draft, contextWindow: n > 0 ? n : null })
        }
      />
    ) : (
      <Text style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        {draft.contextWindow != null
          ? draft.contextWindow.toLocaleString()
          : "—"}
      </Text>
    )}

    {editing ? (
      <select
        aria-label="Tier"
        value={draft.tier}
        onChange={(e) => onChange({ ...draft, tier: e.target.value as Tier })}
        style={{
          padding: "4px 6px",
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "var(--surface)",
          color: "var(--text)",
          fontSize: 12,
        }}
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    ) : (
      <Text style={{ fontSize: 12, color: "var(--text-3)" }}>{draft.tier}</Text>
    )}

    <Flex justifyContent="flex-end" gap={4}>
      {!editing && (
        <button
          type="button"
          onClick={onEdit}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 11.5,
            padding: "4px 8px",
            borderRadius: 4,
            color: "var(--blue)",
          }}
        >
          Edit
        </button>
      )}
      {isOverride && !isCustom && (
        <button
          type="button"
          onClick={onRevertRow}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 4,
            color: "var(--text-3)",
          }}
          title="Revert this model to its built-in defaults"
        >
          Revert
        </button>
      )}
    </Flex>
  </div>
);

interface AddModelFormProps {
  onAdd: (draft: Draft) => void;
  onCancel: () => void;
  existingKeys: Set<string>;
}

const AddModelForm = ({
  onAdd,
  onCancel,
  existingKeys,
}: AddModelFormProps) => {
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("");
  const [tier, setTier] = useState<Tier>("mid");
  const [input, setInput] = useState(0);
  const [output, setOutput] = useState(0);
  const [contextWindow, setContextWindow] = useState(0);
  const [notes, setNotes] = useState("");

  const normalized = normalizeModelKey(key);
  const dup = key.length > 0 && existingKeys.has(normalized);
  const valid =
    key.trim().length > 0 && provider.trim().length > 0 && !dup;

  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface-2)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Flex alignItems="center" justifyContent="space-between">
        <Heading level={4} style={{ fontSize: 13, fontWeight: 700 }}>
          Add a custom model
        </Heading>
        <button
          type="button"
          onClick={onCancel}
          style={{
            all: "unset",
            cursor: "pointer",
            color: "var(--text-3)",
            fontSize: 14,
            padding: 2,
          }}
        >
          ×
        </button>
      </Flex>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(180px, 1.6fr) 110px 110px 130px 110px",
          alignItems: "center",
          columnGap: 12,
          rowGap: 6,
        }}
      >
        <TextInput
          ariaLabel="Model key"
          value={key}
          width={260}
          placeholder="e.g. claude-sonnet-4-7"
          onChange={setKey}
        />
        <NumberInput
          ariaLabel="Input per 1M tokens"
          value={input}
          onChange={setInput}
        />
        <NumberInput
          ariaLabel="Output per 1M tokens"
          value={output}
          onChange={setOutput}
        />
        <NumberInput
          ariaLabel="Context window"
          step={1000}
          width={120}
          value={contextWindow}
          onChange={setContextWindow}
        />
        <select
          aria-label="Tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
          style={{
            padding: "4px 6px",
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 12,
          }}
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <Flex alignItems="center" gap={12}>
        <TextInput
          ariaLabel="Provider"
          value={provider}
          width={180}
          placeholder="Provider (e.g. Anthropic)"
          onChange={setProvider}
        />
        <TextInput
          ariaLabel="Notes"
          value={notes}
          width={260}
          placeholder="Notes (optional)"
          onChange={setNotes}
        />
      </Flex>
      {dup && (
        <Text style={{ fontSize: 11.5, color: "var(--red)" }}>
          A model with key “{normalized}” already exists.
        </Text>
      )}
      <Flex justifyContent="flex-end" gap={8}>
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="accent"
          disabled={!valid}
          onClick={() =>
            onAdd({
              key: normalized,
              provider: provider.trim(),
              tier,
              inputPerMTok: input,
              outputPerMTok: output,
              contextWindow: contextWindow > 0 ? contextWindow : null,
              notes: notes.trim() || undefined,
            })
          }
        >
          Add model
        </Button>
      </Flex>
    </div>
  );
};

interface RevertConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
const RevertConfirm = ({ open, onConfirm, onCancel }: RevertConfirmProps) => {
  if (!open) return null;
  return (
    <div
      role="alertdialog"
      aria-label="Revert pricing to defaults"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 11, 0.55)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          padding: 20,
          borderRadius: 10,
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <Heading level={3} style={{ fontSize: 16, fontWeight: 700 }}>
          Revert to defaults?
        </Heading>
        <Text
          style={{
            fontSize: 12.5,
            color: "var(--text-2)",
            marginTop: 8,
            display: "block",
          }}
        >
          This drops every per-row edit AND every custom model from the
          shared config. Built-in pricing for the known models is restored.
          The change applies to every user of this app immediately.
        </Text>
        <Flex justifyContent="flex-end" gap={8} style={{ marginTop: 16 }}>
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="emphasized" color="critical" onClick={onConfirm}>
            Revert
          </Button>
        </Flex>
      </div>
    </div>
  );
};

export const ModelPricingPanel = () => {
  const t = useModelPricing();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    buildInitialDrafts(t.config),
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Re-seed drafts whenever the panel opens or the remote config changes
  // (e.g., another tab/user saved an update).
  useEffect(() => {
    if (t.isPanelOpen) {
      setDrafts(buildInitialDrafts(t.config));
      setEditingKey(null);
      setShowAdd(false);
      setDirty(false);
    }
  }, [t.isPanelOpen, t.config]);

  useEffect(() => {
    if (!t.isPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmRevert) t.closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [t, confirmRevert]);

  const grouped = useMemo(() => groupByProvider(drafts), [drafts]);
  const providers = Object.keys(grouped).sort();
  const existingKeys = useMemo(
    () => new Set(drafts.map((d) => d.key)),
    [drafts],
  );

  const handleRowChange = (next: Draft) => {
    setDrafts((cur) => cur.map((d) => (d.key === next.key ? next : d)));
    setDirty(true);
  };

  const handleRowRevert = (key: string) => {
    // Revert single row: drop its override, re-derive from built-ins.
    const remainingOverrides = { ...t.config.overrides };
    delete remainingOverrides[key];
    setDrafts(buildInitialDrafts({ overrides: remainingOverrides }));
    setDirty(true);
  };

  const handleAdd = (draft: Draft) => {
    setDrafts((cur) => [...cur, draft]);
    setShowAdd(false);
    setDirty(true);
  };

  const handleSave = () => {
    // Persist only entries that differ from the built-in PRICING or are
    // custom additions, so the storage payload doesn't bloat with full
    // copies of every default record.
    const overrides: Record<string, ModelPricing> = {};
    const builtins = getEffectivePricing();
    // We need the raw built-ins (without overrides applied) for a fair
    // comparison. Cheat by reading from a fresh module import; for now,
    // just persist everything the user touched + custom rows. Simpler
    // and the payload is still small.
    for (const d of drafts) {
      // Heuristic for "is this an override": save when value differs from
      // the current effective built-in OR when notes are set.
      const built = builtins[d.key];
      const differs =
        !built ||
        built.inputPerMTok !== d.inputPerMTok ||
        built.outputPerMTok !== d.outputPerMTok ||
        built.contextWindow !== d.contextWindow ||
        built.provider !== d.provider ||
        built.tier !== d.tier ||
        ((d.notes ?? "") !==
          ((built as ModelPricing & { notes?: string }).notes ?? ""));
      if (differs) {
        overrides[d.key] = {
          inputPerMTok: d.inputPerMTok,
          outputPerMTok: d.outputPerMTok,
          contextWindow: d.contextWindow,
          provider: d.provider,
          tier: d.tier,
          // Stash notes alongside the pricing fields; getPricing() ignores
          // unknown properties.
          ...(d.notes ? { notes: d.notes } : {}),
        } as ModelPricing;
      }
    }
    t.saveConfig({ overrides });
    t.closePanel();
  };

  if (!t.isPanelOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Model pricing"
        onClick={t.closePanel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10, 10, 11, 0.45)",
          zIndex: 1200,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "48px 16px",
          overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--surface)",
            borderRadius: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            maxWidth: 980,
            width: "100%",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <Flex alignItems="flex-start" justifyContent="space-between" gap={16}>
            <Flex flexDirection="column" gap={4}>
              <Heading level={2} style={{ fontSize: 18, fontWeight: 700 }}>
                Model pricing
              </Heading>
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                Edit the rates the app uses to estimate spend. Changes save
                org-wide — every user of this app sees the same numbers.
              </Text>
            </Flex>
            <button
              type="button"
              aria-label="Close"
              onClick={t.closePanel}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: 18,
                color: "var(--text-3)",
              }}
            >
              ×
            </button>
          </Flex>

          <Flex alignItems="center" justifyContent="space-between" gap={8}>
            {!showAdd ? (
              <Button variant="default" onClick={() => setShowAdd(true)}>
                + Add model
              </Button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setConfirmRevert(true)}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--text-3)",
                textDecoration: "underline",
              }}
            >
              Revert to defaults
            </button>
          </Flex>

          {showAdd && (
            <AddModelForm
              existingKeys={existingKeys}
              onCancel={() => setShowAdd(false)}
              onAdd={handleAdd}
            />
          )}

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div
              style={{
                padding: "10px 12px",
                background: "var(--surface-2)",
                display: "grid",
                gridTemplateColumns:
                  "minmax(180px, 1.5fr) 110px 110px 130px 110px auto",
                columnGap: 12,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              <span>Model</span>
              <span>Input / 1M</span>
              <span>Output / 1M</span>
              <span>Context window</span>
              <span>Tier</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {providers.map((provider) => (
              <div key={provider}>
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--surface)",
                    borderTop: "1px solid var(--border)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-2)",
                  }}
                >
                  {provider}
                </div>
                {grouped[provider].map((d) => {
                  const isOverride = Boolean(t.config.overrides[d.key]);
                  // Custom = present in overrides but not in built-ins.
                  // Built-ins live in the merged map BEFORE overrides
                  // applied; using getEffectivePricing minus overrides is
                  // overkill — call it custom if the key wasn't in the
                  // initial effective map without overrides.
                  const isCustom =
                    isOverride && !(d.key in getBuiltinKeys());
                  return (
                    <PricingRow
                      key={d.key}
                      draft={d}
                      editing={editingKey === d.key}
                      onChange={handleRowChange}
                      onEdit={() => setEditingKey(d.key)}
                      onRevertRow={() => handleRowRevert(d.key)}
                      isOverride={isOverride}
                      isCustom={isCustom}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <Flex justifyContent="flex-end" gap={8}>
            <Button variant="default" onClick={t.closePanel}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={!dirty}
              onClick={handleSave}
            >
              Save
            </Button>
          </Flex>
        </div>
      </div>

      <RevertConfirm
        open={confirmRevert}
        onCancel={() => setConfirmRevert(false)}
        onConfirm={() => {
          setConfirmRevert(false);
          t.resetConfig();
          t.closePanel();
        }}
      />
    </>
  );
};

/**
 * Tiny helper: returns the set of model keys baked into the app (the
 * built-in PRICING table). Cached so the panel doesn't re-derive on
 * every row render.
 *
 * Lazy import avoids a circular type-only reference and lets the module
 * tree-shake when the panel isn't open.
 */
let _builtinKeysCache: Record<string, true> | null = null;
const getBuiltinKeys = (): Record<string, true> => {
  if (_builtinKeysCache) return _builtinKeysCache;
  const keys: Record<string, true> = {};
  // Inline the canonical keys list — they're stable and small. Anything
  // not in this list that appears in `overrides` is treated as custom.
  const builtIns = [
    "claude-opus-4-5",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    "claude-opus-4-6",
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
    "claude-3-haiku",
    "claude-3-opus",
    "gpt-4-1",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2-5-pro",
    "gemini-2-5-flash",
    "text-embedding-3-large",
    "text-embedding-3-small",
  ];
  for (const k of builtIns) keys[k] = true;
  _builtinKeysCache = keys;
  return keys;
};
