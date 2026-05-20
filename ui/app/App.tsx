import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { Data } from "./pages/Data";
import { AppFooter } from "./components/AppFooter";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { AgentsPage } from "./pages/Agents/AgentsPage";
import { ExplorerPage } from "./pages/Explorer/ExplorerPage";
import { FinOpsPage } from "./pages/FinOps/FinOpsPage";
import { ModelsPage } from "./pages/Models/ModelsPage";
import { PromptsPage } from "./pages/Prompts/PromptsPage";
import { PulsePage } from "./pages/Pulse/PulsePage";
import { ToolsPage } from "./pages/Tools/ToolsPage";
import { TopologyPage } from "./pages/Topology/TopologyPage";
import { GlobalFilterStrip } from "./layout/GlobalFilterStrip";
import { SamplingProvider } from "./scope/SamplingContext";
import { ScanLimitProvider } from "./scope/ScanLimitContext";
import { ScopeProvider } from "./scope/ScopeContext";
import { ThemeStyles } from "./theme/ThemeStyles";

export const App = () => {
  return (
    <SamplingProvider>
    <ScanLimitProvider>
    <ScopeProvider>
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
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/prompts" element={<PromptsPage />} />
                <Route path="/topology" element={<TopologyPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/finops" element={<FinOpsPage />} />
                <Route path="/home" element={<Home />} />
                <Route path="/data" element={<Data />} />
              </Routes>
            </div>
            <AppFooter />
          </div>
        </Page.Main>
      </Page>
    </ScopeProvider>
    </ScanLimitProvider>
    </SamplingProvider>
  );
};
