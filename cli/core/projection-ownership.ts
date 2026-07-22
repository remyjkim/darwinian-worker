// ABOUTME: Selects projection ownership for full and partial write reconciliation.
// ABOUTME: Keeps retention policy independent from adapter-specific filesystem paths.

import { dedupeManagedPathsByPath, type ManagedPath, type ProjectionTarget } from "./write-record";

export interface ProjectionSelection {
  mcpOnly?: boolean;
  skillsOnly?: boolean;
  target?: Extract<ProjectionTarget, "claude" | "codex" | "cursor" | "opencode">;
}

export function isProjectionOwnershipSelected(
  entry: Pick<ManagedPath, "surface" | "target">,
  selection: ProjectionSelection,
) {
  if (entry.surface === "worker") {
    return true;
  }
  if (entry.surface === "mcp") {
    return !selection.skillsOnly && (!selection.target || entry.target === selection.target);
  }
  if (entry.surface === "skill") {
    return !selection.mcpOnly && (!selection.target || entry.target === selection.target);
  }
  return !selection.mcpOnly && !selection.skillsOnly && (!selection.target || entry.target === selection.target);
}

export function retainUnselectedProjectionOwnership(
  previous: ManagedPath[],
  desired: ManagedPath[],
  selection: ProjectionSelection,
) {
  const retained = previous.filter((entry) => !isProjectionOwnershipSelected(entry, selection));
  return dedupeManagedPathsByPath([...retained, ...desired]);
}
