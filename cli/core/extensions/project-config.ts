// ABOUTME: Translates semantic per-project extension config into concrete skill and MCP effects.
// ABOUTME: Keeps extension-specific project behavior out of the generic project config merge path.

import type { CanonicalConfig, CanonicalRegistry, ProjectConfig, ProjectExtensionConfig } from "../types";
import { projectConfigPath, readProjectConfigForWrite, setProjectExtensionConfig, writeProjectConfigForWrite } from "../project-writes";
import { getExtension } from "./registry";

export function extensionSkillNames(extensionName: string) {
  return getExtension(extensionName)?.skills.map((skill) => skill.name) ?? [];
}

function addAll(target: Set<string>, values: string[]) {
  for (const value of values) {
    target.add(value);
  }
}

export function applyProjectExtensionConfig(options: {
  config: CanonicalConfig;
  registry: CanonicalRegistry;
  extensions?: ProjectConfig["extensions"];
  include: Set<string>;
  exclude: Set<string>;
}) {
  const parallel = options.extensions?.parallel;
  if (parallel) {
    const skills = extensionSkillNames("parallel");
    options.config.parallel ??= { cli: { enabled: true }, mcp: { enabled: false } };
    options.config.parallel.cli ??= { enabled: true };
    options.config.parallel.mcp ??= { enabled: false };

    if (parallel.enabled === false) {
      options.config.parallel.cli.enabled = false;
      options.config.parallel.mcp.enabled = false;
      addAll(options.exclude, skills);
    } else {
      options.config.parallel.cli.enabled = true;
      options.config.parallel.mcp.enabled = parallel.mcp === true;
      addAll(parallel.skills === false ? options.exclude : options.include, skills);
    }
  }

  const beads = options.extensions?.beads;
  if (beads) {
    if (beads.enabled === false) {
      options.exclude.add("beads-task-tracking");
    } else if (beads.includeSkill === true) {
      options.include.add("beads-task-tracking");
    }
  }

  const markitdown = options.extensions?.markitdown;
  if (markitdown) {
    const skills = extensionSkillNames("markitdown");
    if (markitdown.enabled === false) {
      addAll(options.exclude, skills);
    } else {
      addAll(markitdown.skills === false ? options.exclude : options.include, skills);
    }
  }
}

export function mergeProjectSkillOverrides(project: ProjectConfig) {
  const include = new Set(project.skills?.include ?? []);
  const exclude = new Set(project.skills?.exclude ?? []);
  return { include, exclude };
}

export function toProjectSkillOverrides(include: Set<string>, exclude: Set<string>): ProjectConfig["skills"] | undefined {
  const includeValues = [...include].filter((name) => !exclude.has(name));
  const excludeValues = [...exclude];
  if (includeValues.length === 0 && excludeValues.length === 0) {
    return undefined;
  }
  return {
    ...(includeValues.length > 0 ? { include: includeValues } : {}),
    ...(excludeValues.length > 0 ? { exclude: excludeValues } : {}),
  };
}

export function ensureProjectExtensionConfig(
  projectDir: string,
  extensionName: string,
  extensionConfig: ProjectExtensionConfig,
) {
  return setProjectExtensionConfig(projectDir, extensionName, extensionConfig);
}

export { projectConfigPath, readProjectConfigForWrite, writeProjectConfigForWrite };
