import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { GridIcon, SettingIcon } from "@dynatrace/strato-icons";
import { HeaderTimeframe } from "./HeaderTimeframe";
import { useTweaks } from "../tweaks/TweaksContext";
import { useEditLayout } from "../layout/EditLayoutContext";
import { ModelPricingButton } from "../pricing/ModelPricingButton";

/**
 * Primary navigation, grouped into four labeled clusters and rendered as a
 * dedicated tab strip beneath the app bar (IA — see Information-1):
 *   OVERVIEW — Summary, Pulse                      (the front-door dashboards)
 *   ANALYZE  — Explorer, Agents, Models, Prompts,   (per-entity analytics)
 *              AWS Bedrock
 *   AUDIT    — Telemetry                           (instrumentation coverage:
 *              OTel span attributes + AWS Bedrock raw logs/metrics/CloudTrail)
 * Field Notes + About are trailing utility items — right-aligned, outside any
 * group label — so low-frequency meta pages no longer compete with the core
 * analytics tabs. Folded routes still resolve: Tools/Topology → Agents, MCP
 * Health → Pulse, FinOps → Models (now an in-page section on the Models tab).
 *
 * Every tab is a real <Link>, so routing + keyboard nav are native and the
 * active tab reuses the .aiobs-nav-active pill (accent fill + var(--accent-fg)
 * text). The strip stays visible on every route so every tab is reachable from
 * every other; the Pulse architecture map is a *secondary* router on top of it.
 */
type NavItem = { to: string; label: string };
type NavGroup = { id: string; label?: string; utility?: boolean; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { to: "/summary", label: "Summary" },
      { to: "/pulse", label: "Pulse" },
    ],
  },
  {
    id: "analyze",
    label: "Analyze",
    items: [
      { to: "/explorer", label: "Explorer" },
      { to: "/agents", label: "Agents" },
      { to: "/models", label: "Models" },
      { to: "/prompts", label: "Prompts" },
      { to: "/bedrock", label: "AWS Bedrock" },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    items: [{ to: "/attributes", label: "Telemetry" }],
  },
  {
    id: "utility",
    utility: true,
    items: [
      { to: "/field-notes", label: "Field Notes" },
      { to: "/about", label: "About" },
    ],
  },
];

export const Header = () => {
  const { isPanelOpen, togglePanel } = useTweaks();
  const { editLayout, toggle: toggleEditLayout } = useEditLayout();
  // Carry the current query string (timeframe ?from/?to, etc.) across tab
  // navigation so the selected scope doesn't reset when switching pages.
  const { search, pathname } = useLocation();

  // Mark the active tab so it gets a clear highlight. Summary is the front door
  // and owns both "/" and "/summary"; Pulse owns only "/pulse" now; every other
  // tab matches its own path (and nested sub-paths).
  const isActive = (to: string): boolean => {
    if (to === "/summary") return pathname === "/" || pathname === "/summary";
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <>
      <AppHeader>
        {/* The pills moved to the grouped strip below; Navigation now carries
            only the logo, keeping the app bar for identity + global actions. */}
        <AppHeader.Navigation>
          <AppHeader.Logo as={Link} to={{ pathname: "/", search }} />
        </AppHeader.Navigation>
        <AppHeader.ActionItems>
          <HeaderTimeframe />
          <ModelPricingButton />
          <AppHeader.ActionButton
            prefixIcon={<GridIcon />}
            isSelected={editLayout}
            onClick={toggleEditLayout}
            aria-label="Customize layout"
            aria-pressed={editLayout}
          >
            Customize
          </AppHeader.ActionButton>
          <AppHeader.ActionButton
            prefixIcon={<SettingIcon />}
            isSelected={isPanelOpen}
            onClick={togglePanel}
            aria-label="Tweaks"
            aria-pressed={isPanelOpen}
            data-aiobs-tweaks-trigger=""
          >
            Tweaks
          </AppHeader.ActionButton>
        </AppHeader.ActionItems>
      </AppHeader>

      {/* Grouped primary tab strip (IA — Information-1). Lives on its own row
          under the app bar so the four clusters + labels + dividers have room
          and no longer crowd the logo / timeframe / pricing / Tweaks actions.
          The region scrolls horizontally when the viewport is too narrow rather
          than wrapping or collapsing into a menu, so every tab stays reachable. */}
      <nav className="aiobs-tabnav" aria-label="Primary">
        <div className="aiobs-tabnav-scroll">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.id}
              className={
                "aiobs-tabnav-group" +
                (group.utility ? " aiobs-tabnav-group--utility" : "") +
                (!group.utility && groupIndex > 0
                  ? " aiobs-tabnav-group--divided"
                  : "")
              }
            >
              {group.label && (
                <span className="aiobs-tabnav-label">{group.label}</span>
              )}
              {group.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={{ pathname: item.to, search }}
                    // Reuse the .aiobs-nav-active pill (accent fill + accessible
                    // var(--accent-fg) text) for the current tab; a real <Link>
                    // keeps routing + keyboard focus native.
                    aria-current={active ? "page" : undefined}
                    className={
                      "aiobs-tabnav-pill" + (active ? " aiobs-nav-active" : "")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
};
