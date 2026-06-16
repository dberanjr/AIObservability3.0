import { Page } from "@dynatrace/strato-components-preview/layouts";
import { SegmentsProvider } from "@dynatrace/strato-components/filters";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { AppFooter } from "./components/AppFooter";
import { Header } from "./components/Header";
import { RedirectKeepingSearch } from "./lib/nav";
import { Home } from "./pages/Home";
import { AgentsPage } from "./pages/Agents/AgentsPage";
import { ExplorerPage } from "./pages/Explorer/ExplorerPage";
import { ModelsPage } from "./pages/Models/ModelsPage";
import { PromptsPage } from "./pages/Prompts/PromptsPage";
import { PulsePage } from "./pages/Pulse/PulsePage";
import { GlobalFilterStrip } from "./layout/GlobalFilterStrip";
import { SamplingProvider } from "./scope/SamplingContext";
import { ScanLimitProvider } from "./scope/ScanLimitContext";
import { ScopeProvider } from "./scope/ScopeContext";
import { GlobalFilterProvider } from "./scope/GlobalFilterContext";
import { TraceScopeProvider } from "./scope/TraceScopeContext";
import { CapabilityProvider } from "./scope/CapabilityContext";
import { ThemeStyles } from "./theme/ThemeStyles";
import { TweaksProvider } from "./tweaks/TweaksContext";
import { TweaksPanel } from "./tweaks/TweaksPanel";
import { ColorBlindFilters } from "./tweaks/ColorBlindFilters";
import { ModelPricingProvider } from "./pricing/ModelPricingContext";
import { ModelPricingPanel } from "./pricing/ModelPricingPanel";

export const App = () => {
  return (
    <TweaksProvider>
    <ModelPricingProvider>
    <SegmentsProvider>
    <SamplingProvider>
    <ScanLimitProvider>
    <ScopeProvider>
    <GlobalFilterProvider>
    <TraceScopeProvider>
    <CapabilityProvider>
      <ThemeStyles />
      <Page>
        <Page.Header>
          <Header />
          <GlobalFilterStrip />
        </Page.Header>
        <Page.Main>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
            }}
          >
            <div style={{ flex: 1 }}>
              <Routes>
                <Route path="/" element={<PulsePage />} />
                <Route path="/pulse" element={<PulsePage />} />
                <Route path="/explorer" element={<ExplorerPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/prompts" element={<PromptsPage />} />
                <Route path="/models" element={<ModelsPage />} />
                {/* Folded tabs — redirect old deep-links to their new homes.
                    Tools + Topology → Agents, MCP Health → Pulse, FinOps →
                    Models / FinOps. Query string (timeframe, focus) carries. */}
                <Route
                  path="/tools"
                  element={<RedirectKeepingSearch to="/agents" />}
                />
                <Route
                  path="/topology"
                  element={<RedirectKeepingSearch to="/agents" />}
                />
                <Route
                  path="/mcp-health"
                  element={<RedirectKeepingSearch to="/pulse" />}
                />
                <Route
                  path="/finops"
                  element={<RedirectKeepingSearch to="/models" />}
                />
                <Route path="/home" element={<Home />} />
              </Routes>
            </div>
            <AppFooter />
          </div>
        </Page.Main>
      </Page>
      <TweaksPanel />
      <ModelPricingPanel />
      <ColorBlindFilters />
    </CapabilityProvider>
    </TraceScopeProvider>
    </GlobalFilterProvider>
    </ScopeProvider>
    </ScanLimitProvider>
    </SamplingProvider>
    </SegmentsProvider>
    </ModelPricingProvider>
    </TweaksProvider>
  );
};
