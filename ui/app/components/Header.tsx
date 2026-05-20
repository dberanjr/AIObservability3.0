import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components-preview/layouts";
import { SettingIcon } from "@dynatrace/strato-icons";

const ACTIVATE_EVENT = "__activate_edit_mode";
const DEACTIVATE_EVENT = "__deactivate_edit_mode";
const DISMISSED_EVENT = "__edit_mode_dismissed";

export const Header = () => {
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data === DISMISSED_EVENT) {
        setTweaksOpen(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onTweaksClick = useCallback(() => {
    const next = !tweaksOpen;
    setTweaksOpen(next);
    window.postMessage(next ? ACTIVATE_EVENT : DEACTIVATE_EVENT, "*");
  }, [tweaksOpen]);

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
        <AppHeader.NavigationItem as={Link} to="/data">
          Explore Data
        </AppHeader.NavigationItem>
      </AppHeader.Navigation>
      <AppHeader.ActionItems>
        <AppHeader.ActionButton
          prefixIcon={<SettingIcon />}
          isSelected={tweaksOpen}
          onClick={onTweaksClick}
          aria-label="Tweaks"
          aria-pressed={tweaksOpen}
        >
          Tweaks
        </AppHeader.ActionButton>
      </AppHeader.ActionItems>
    </AppHeader>
  );
};
