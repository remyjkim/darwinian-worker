// ABOUTME: Defines the domain types for drwn extension metadata and health reports.
// ABOUTME: Keeps extension concepts separate from MCP servers and skill bundles.

export type ExtensionScope = "global" | "project";
export type ExtensionMode = "cli" | "skills" | "mcp" | "hooks";
export type ExtensionCommandPurpose = "runtime" | "installer";

export interface ExtensionCommandRequirement {
  name: string;
  required: boolean;
  installHints: string[];
  purpose?: ExtensionCommandPurpose;
}

export interface ExtensionSkillReference {
  name: string;
  source: "repo" | "package";
  defaultIncluded: boolean;
}

export interface ExtensionMcpReference {
  name: string;
  defaultEnabled: boolean;
  scope: ExtensionScope;
}

export interface ExtensionDefinition {
  id: string;
  displayName: string;
  description: string;
  scopes: ExtensionScope[];
  defaultModes: ExtensionMode[];
  commands: ExtensionCommandRequirement[];
  skills: ExtensionSkillReference[];
  mcpServers: ExtensionMcpReference[];
  docs: Array<{ label: string; url: string }>;
}

export interface ExtensionStatus {
  id: string;
  displayName: string;
  available: boolean;
  scope: "global" | "project" | "mixed";
  commands: Array<{
    name: string;
    required: boolean;
    available: boolean;
    path?: string;
    installHints: string[];
  }>;
  skills: Array<{
    name: string;
    present: boolean;
    curated: boolean;
  }>;
  mcpServers: Array<{
    name: string;
    configured: boolean;
    active: boolean;
  }>;
  project?: {
    cwd: string;
    configPath?: string;
    extensionConfigured?: boolean;
    extensionEnabled?: boolean;
    beadsDirExists?: boolean;
  };
  warnings: string[];
}

export interface ExtensionDoctorReport {
  id: string;
  displayName: string;
  issues: string[];
  warnings: string[];
}
