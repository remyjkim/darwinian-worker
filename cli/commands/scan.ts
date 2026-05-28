// ABOUTME: Reserves the future `bgng scan` command as a safe no-op placeholder.
// ABOUTME: Keeps scan discoverable while import and recommendation semantics are designed separately.

import { Option } from "clipanion";
import { renderJson } from "../core/output";
import { BaseCommand } from "./base";

const plannedRole = [
  "inspect existing local agent tool config",
  "report import candidates for library, defaults, and project config",
  "avoid writing files unless a future explicit import/write step is added",
];

export class ScanCommand extends BaseCommand {
  static override paths = [["scan"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Placeholder for future non-mutating local harness discovery.",
    details: `
      This command is intentionally a no-op today. Its planned role is to
      inspect existing local agent tool config, report import candidates for
      library/default/project promotion, and avoid writing files unless a
      future explicit import step is added.
    `,
    examples: [
      ["Show the current placeholder output", "bgng scan"],
      ["Inspect placeholder status as JSON", "bgng scan --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const result = {
      implemented: false,
      changes: [] as string[],
      plannedRole,
      message: "bgng scan is not implemented yet.",
    };

    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }

    this.context.stdout.write(
      [
        "bgng scan is not implemented yet.",
        "",
        "Planned role:",
        ...plannedRole.map((item) => `- ${item}`),
        "",
        "No files changed.",
      ].join("\n"),
    );
    this.context.stdout.write("\n");
    return 0;
  }
}
