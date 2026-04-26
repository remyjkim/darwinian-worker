// ABOUTME: Defines the shared domain types used by the agents CLI core and compatibility wrapper.
// ABOUTME: Centralizes canonical registry, config, target, and sync result types to avoid drift.

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

export type ServerOverride =
  | { enabled: boolean }
  | RegistryServer;

export interface ProjectConfig {
  version: number;
  servers?: Record<string, ServerOverride>;
  skills?: {
    include?: string[];
    exclude?: string[];
  };
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
}

export interface SyncResult {
  changes: string[];
  warnings: string[];
}

export interface NormalizedSyncOptions {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  cwd?: string;
  dryRun: boolean;
  mcpOnly: boolean;
  skillsOnly: boolean;
  target?: TargetName;
}
