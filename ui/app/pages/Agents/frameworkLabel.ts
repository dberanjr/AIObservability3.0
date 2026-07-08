import { detectFrameworkFromSignals, FRAMEWORK_LABEL } from "../../detection/attributes";

/** Resolve a human framework label for an agent row, or null when unknown. */
export const resolveAgentFramework = (r: {
  fw_workflow?: string | null;
  fw_entity?: string | null;
  fw_system?: string | null;
  fw_span?: string | null;
}): string | null => {
  const id = detectFrameworkFromSignals({
    workflowName: r.fw_workflow,
    entityName: r.fw_entity,
    genAiSystem: r.fw_system,
    spanName: r.fw_span,
  });
  return id === "unknown" || id === "custom" ? null : FRAMEWORK_LABEL[id];
};
