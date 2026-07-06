import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { SettingIcon } from "@dynatrace/strato-icons";
import { HeaderTimeframe } from "./HeaderTimeframe";
import { useTweaks } from "../tweaks/TweaksContext";
import { ModelPricingButton } from "../pricing/ModelPricingButton";

/**
 * Top-nav tabs, in display order. Pulse is also the index ("/") route.
 *
 * Five-tab structure (the redesign): Tools + Topology fold into Agents,
 * MCP Health folds into Pulse, and FinOps merges into Models ("Models /
 * FinOps"). The bar stays visible on every route so every tab is reachable
 * from every other; the Pulse architecture map is a *secondary* router on top
 * of this bar, never a replacement for it.
 */
const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/summary", label: "Summary" },
  { to: "/pulse", label: "Pulse" },
  { to: "/explorer", label: "Explorer" },
  { to: "/agents", label: "Agents" },
  { to: "/prompts", label: "Prompts" },
  { to: "/models", label: "Models / FinOps" },
  { to: "/attributes", label: "Attributes" },
  { to: "/field-notes", label: "Field Notes" },
  { to: "/about", label: "About" },
];

export const Header = () => {
  const { isPanelOpen, togglePanel } = useTweaks();
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
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to={{ pathname: "/", search }} />
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.to);
          return (
            <AppHeader.NavigationItem
              key={item.to}
              as={Link}
              to={{ pathname: item.to, search }}
              // Deliberately NOT using isSelected: Strato's selected state draws
              // an ::after underline we don't want. Our .aiobs-nav-active pill
              // (solid fill + white text) is the highlight instead.
              aria-current={active ? "page" : undefined}
              className={active ? "aiobs-nav-active" : undefined}
            >
              {item.label}
            </AppHeader.NavigationItem>
          );
        })}
      </AppHeader.Navigation>
      <AppHeader.ActionItems>
        <HeaderTimeframe />
        <ModelPricingButton />
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
  );
};
