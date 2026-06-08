import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { SettingIcon } from "@dynatrace/strato-icons";
import { HeaderTimeframe } from "./HeaderTimeframe";
import { useTweaks } from "../tweaks/TweaksContext";
import { ModelPricingButton } from "../pricing/ModelPricingButton";

export const Header = () => {
  const { isPanelOpen, togglePanel } = useTweaks();
  // Carry the current query string (timeframe ?from/?to, etc.) across tab
  // navigation so the selected scope doesn't reset when switching pages.
  const { search } = useLocation();

  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to={{ pathname: "/", search }} />
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/pulse", search }}>
          Pulse
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/explorer", search }}>
          Explorer
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/agents", search }}>
          Agents
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/tools", search }}>
          Tools
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/prompts", search }}>
          Prompts
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/topology", search }}>
          Topology
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/mcp-health", search }}>
          MCP Health
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/models", search }}>
          Models
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to={{ pathname: "/finops", search }}>
          FinOps
        </AppHeader.NavigationItem>
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
