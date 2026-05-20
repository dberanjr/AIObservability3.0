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
  [/search|retriev|vector|embed|rag|index/i, "Search"],
  [/db|sql|query|postgres|mysql|mongo|redis|cassandra/i, "Database"],
  [/http|fetch|api|rest|graphql|webhook/i, "HTTP"],
  [/file|read_file|write_file|fs_|filesystem/i, "File"],
  [/exec|compute|run|code|interpreter|shell|bash/i, "Compute"],
  [/mcp/i, "MCP"],
];

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
