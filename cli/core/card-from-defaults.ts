// ABOUTME: Captures machine default skills into a new profile Card source.
// ABOUTME: Reuses card source scaffolding and bundled skill copy helpers.

import { addCardSourceSkill } from "./card-source";
import { createCardSource, readMachineConfig } from "./card-store";

export async function createProfileCardFromDefaults(options: {
  agentsDir: string;
  repoRoot: string;
  homeDir: string;
  name: string;
  scope?: string;
  noGit?: boolean;
}) {
  const machine = await readMachineConfig(options.agentsDir);
  if (machine.capabilities.skills.length === 0) {
    throw new Error("No default skill set configured in machine.json. Add defaults with drwn library defaults add-skill first.");
  }
  const skillNames = [...machine.capabilities.skills];
  if (skillNames.length === 0) {
    throw new Error("No default skill set configured in machine.json. Add defaults with drwn library defaults add-skill first.");
  }
  const scope = options.scope ?? machine.policy.authoring?.scope;
  const source = await createCardSource({
    agentsDir: options.agentsDir,
    name: options.name,
    scope,
    noGit: options.noGit,
  });
  for (const skillName of skillNames) {
    await addCardSourceSkill({
      agentsDir: options.agentsDir,
      repoRoot: options.repoRoot,
      homeDir: options.homeDir,
      cardName: source.name,
      skillName,
    });
  }
  return { ...source, skillCount: skillNames.length };
}
