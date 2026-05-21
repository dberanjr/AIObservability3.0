import React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { SettingIcon } from "@dynatrace/strato-icons";
import { HeaderTimeframe } from "./HeaderTimeframe";
import { useTweaks } from "../tweaks/TweaksContext";
import { ModelPricingButton } from "../pricing/ModelPricingButton";

export const Header = () => {
  const { isPanelOpen, togglePanel } = useTweaks();

  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" />
        <AppHeader.NavigationItem as={Link} to="/pulse">
          Pulse
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/explorer">
          Explorer
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/agents">
          Agents
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/tools">
          Tools
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/prompts">
          Prompts
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/topology">
          Topology
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/models">
          Models
        </AppHeader.NavigationItem>
        <AppHeader.NavigationItem as={Link} to="/finops">
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
