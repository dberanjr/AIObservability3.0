import { Page } from "@dynatrace/strato-components-preview/layouts";
import { SegmentsProvider } from "@dynatrace/strato-components/filters";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { AppFooter } from "./components/AppFooter";
import { Header } from "./components/Header";
import { RedirectKeepingSearch } from "./lib/nav";
import { AgentsPage } from "./pages/Agents/AgentsPage";
import { BedrockPage } from "./pages/Bedrock/BedrockPage";
import { ExplorerPage } from "./pages/Explorer/ExplorerPage";
import { ModelsPage } from "./pages/Models/ModelsPage";
import { PromptsPage } from "./pages/Prompts/PromptsPage";
import { PulsePage } from "./pages/Pulse/PulsePage";
import { SummaryPage } from "./pages/Summary/SummaryPage";
import { AttributeAuditPage } from "./pages/AttributeAudit/AttributeAuditPage";
import { About } from "./pages/About/About";
import { FieldNotesPage } from "./pages/FieldNotes/FieldNotesPage";
import { GlobalFilterStrip } from "./layout/GlobalFilterStrip";
import { SamplingProvider } from "./scope/SamplingContext";
import { ScanLimitProvider } from "./scope/ScanLimitContext";
import { ScopeProvider } from "./scope/ScopeContext";
import { GlobalFilterProvider } from "./scope/GlobalFilterContext";
import { TraceScopeProvider } from "./scope/TraceScopeContext";
import { CapabilityProvider } from "./scope/CapabilityContext";
import { ScanReportProvider } from "./scope/ScanReportContext";
import { AccountNamesProvider } from "./scope/AccountNamesContext";
import { ThemeStyles } from "./theme/ThemeStyles";
import { TweaksProvider } from "./tweaks/TweaksContext";
import { EditLayoutProvider } from "./layout/EditLayoutContext";
import { TweaksPanel } from "./tweaks/TweaksPanel";
import { DemoModeBanner } from "./tweaks/DemoModeBanner";
import { ColorBlindFilters } from "./tweaks/ColorBlindFilters";
import { ModelPricingProvider } from "./pricing/ModelPricingContext";
import { ModelPricingPanel } from "./pricing/ModelPricingPanel";

export const App = () => {
  return (
    <TweaksProvider>
    <EditLayoutProvider>
    <ModelPricingProvider>
    <AccountNamesProvider>
    <SegmentsProvider>
    <SamplingProvider>
    <ScanLimitProvider>
    <ScopeProvider>
    <GlobalFilterProvider>
    <TraceScopeProvider>
    <CapabilityProvider>
    <ScanReportProvider>
      <ThemeStyles />
      <Page>
        <Page.Header>
          <DemoModeBanner />
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
                <Route path="/" element={<SummaryPage />} />
                <Route path="/summary" element={<SummaryPage />} />
                <Route path="/pulse" element={<PulsePage />} />
                <Route path="/explorer" element={<ExplorerPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/prompts" element={<PromptsPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/bedrock" element={<BedrockPage />} />
                <Route path="/attributes" element={<AttributeAuditPage />} />
                {/* Folded tabs — redirect old deep-links to their new homes.
                    Tools + Topology → Agents, MCP Health → Pulse, FinOps →
                    Models (FinOps is an in-page section on the Models tab now).
                    Query string (timeframe, focus) carries. */}
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
                <Route path="/about" element={<About />} />
                <Route path="/field-notes" element={<FieldNotesPage />} />
              </Routes>
            </div>
            <AppFooter />
          </div>
        </Page.Main>
      </Page>
      <TweaksPanel />
      <ModelPricingPanel />
      <ColorBlindFilters />
    </ScanReportProvider>
    </CapabilityProvider>
    </TraceScopeProvider>
    </GlobalFilterProvider>
    </ScopeProvider>
    </ScanLimitProvider>
    </SamplingProvider>
    </SegmentsProvider>
    </AccountNamesProvider>
    </ModelPricingProvider>
    </EditLayoutProvider>
    </TweaksProvider>
  );
};
