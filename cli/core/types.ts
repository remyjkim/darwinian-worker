// ABOUTME: Defines the shared domain types used by the drwn harness CLI core and compatibility wrapper.
// ABOUTME: Centralizes registry, config, target, and sync result types to avoid drift.

export type Transport = "stdio" | "http" | "sse" | "platform-provided";
export type TargetName = "claude" | "codex" | "cursor";

export interface RegistryServer {
  description: string;
  transport: Transport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  provider?: string;
  capabilities?: string[];
  notes?: string;
  optional: boolean;
  startupTimeoutSec?: number;
}

export interface CanonicalRegistry {
  version: number;
  servers: Record<string, RegistryServer>;
}

export interface UserMcpLibrary {
  version: number;
  servers: Record<string, RegistryServer>;
}

export interface TargetConfig {
  enabled: boolean;
  configPath: string;
  format: "json-merge" | "toml-merge" | "json-standalone";
  mcpKey: string;
  symlink?: boolean;
}

export interface CanonicalConfig {
  version: number;
  targets: Record<TargetName, TargetConfig>;
  defaults?: {
    skills?: string[];
    mcpServers?: string[];
    extensions?: Record<string, ProjectExtensionConfig>;
  };
  catalogs?: {
    npmSkills?: {
      enabled: boolean;
      searchLimit?: number;
    };
    mcp?: {
      enabled: boolean;
      sources?: Array<
        | { type: "file"; path: string }
        | { type: "url"; url: string }
      >;
    };
  };
  parallel?: {
    cli?: {
      enabled: boolean;
    };
    mcp?: {
      enabled: boolean;
    };
  };
  optional: Record<string, boolean>;
}

export interface StoreMetadata {
  schemaVersion: 1;
  initAt: string;
}

export type MachineConfig = CanonicalConfig & {
  authoring?: {
    scope?: string;
  };
};

export type ServerOverride =
  | { enabled: boolean }
  | RegistryServer;

export type ProjectExtensionConfig = {
  enabled?: boolean;
  skills?: boolean;
  mcp?: boolean;
  targets?: string[];
  includeSkill?: boolean;
  [key: string]: unknown;
};

export interface ProjectConfig {
  version: number;
  cards?: string[];
  servers?: Record<string, ServerOverride>;
  skills?: {
    include?: string[];
    exclude?: string[];
  };
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
}

export type SkillSourceType = "repo" | "npm";

export interface BundleSkillEntry {
  name: string;
  scope: "shared" | "claude-only" | "codex-only" | "experimental";
  path: string;
}

export interface BundleManifest {
  schemaVersion: number;
  bundleName: string;
  version: string;
  displayName?: string;
  description?: string;
  skills: BundleSkillEntry[];
}

export interface InstalledSkillBundle {
  packageName: string;
  activeVersion: string;
  packageRoot: string;
  versionRoot: string;
  manifest: BundleManifest;
}

export interface SyncOptions {
  repoRoot?: string;
  agentsDir?: string;
  homeDir?: string;
  cwd?: string;
  dryRun?: boolean;
  mcpOnly?: boolean;
  skillsOnly?: boolean;
  target?: TargetName;
  force?: boolean;
}

export interface SyncResult {
  changes: string[];
  warnings: string[];
  managedPaths?: import("./write-record").ManagedPath[];
}

export interface NormalizedSyncOptions {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  cwd?: string;
  toolRoot?: string;
  writeScope?: "machine" | "project";
  generatedDir?: string;
  dryRun: boolean;
  mcpOnly: boolean;
  skillsOnly: boolean;
  target?: TargetName;
  force?: boolean;
}
