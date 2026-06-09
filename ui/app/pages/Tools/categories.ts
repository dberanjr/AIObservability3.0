export type ToolCategory =
  | "Search"
  | "Database"
  | "HTTP"
  | "File"
  | "Compute"
  | "MCP"
  | "Other";

export const TOOL_CATEGORIES: ToolCategory[] = [
  "Search",
  "Database",
  "HTTP",
  "File",
  "Compute",
  "MCP",
  "Other",
];

export const CATEGORY_COLOR: Record<ToolCategory, string> = {
  Search: "var(--cyan)",
  Database: "var(--purple)",
  HTTP: "var(--blue)",
  File: "var(--green-2)",
  Compute: "var(--amber)",
  MCP: "var(--purple-2)",
  Other: "var(--text-4)",
};

const PATTERNS: Array<[RegExp, ToolCategory]> = [
// First match wins, so list more specific families first. Tuned against real
// tenant span names (predict_load_factor, search_aims_issues,
// execute_athena_query_endpoint, agent_graph_execution, websocket_endpoint, …).
  [/search|retriev|vector|embed|\brag\b|\bindex\b|lookup|knowledge|\bkb[_.]|semantic|research|similar/i, "Search"],
  [/\bsql\b|\bdb\b|database|query|postgres|mysql|mongo|redis|cassandra|athena|databricks|dynamo|snowflake|select/i, "Database"],
  [/http|fetch|\bapi\b|\brest\b|graphql|webhook|endpoint|websocket|\bgrpc\b|passthrough|request|\burl\b/i, "HTTP"],
  [/\bfile\b|read_file|write_file|fs_|filesystem|\bs3\b|upload|download|blob|storage/i, "File"],
  [/exec|compute|\brun\b|\bcode\b|interpreter|shell|bash|predict|infer|generate|graph|process|classif|enhance|calculat|\bnode\b|validat|supervisor|hook/i, "Compute"],
  [/mcp/i, "MCP"],
];

/**
 * Classify a tool. A REAL MCP server (mcpServer) means MCP. Otherwise the tool
 * name decides the family — a synthesized server is intentionally NOT treated
 * as MCP (see buildDiscoveredToolsQuery).
 */
export const inferToolCategory = (
  toolName?: string | null,
  mcpServer?: string | null,
): ToolCategory => {
  if (mcpServer) return "MCP";
  if (!toolName) return "Other";
  for (const [re, cat] of PATTERNS) {
    if (re.test(toolName)) return cat;
  }
  return "Other";
};
