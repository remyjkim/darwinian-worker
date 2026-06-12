// ABOUTME: Implements `drwn card show` for inspecting a resolved card version.
// ABOUTME: Supports both human and JSON output for published card metadata.

import { Option } from "clipanion";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCard } from "../../core/card-store";
import { DrwnError } from "../../core/errors";
import * as git from "../../core/git";
import { renderJson, renderTable } from "../../core/output";
import { resolveCardBareRepoPath } from "../../core/store-paths";
import { BaseCommand } from "../base";

function readPolicyKind(policyPath: string) {
  const text = readFileSync(policyPath, "utf8");
  const match = text.match(/policyKind\s*:\s*["'](enforcement|observer)["']/);
  return match?.[1] ?? "unknown";
}

function readHookReadmeSummary(readmePath: string) {
  if (!existsSync(readmePath)) {
    return "";
  }
  const firstLine = readFileSync(readmePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
  return firstLine.replace(/^#+\s*/, "");
}

function readHookSummaries(cardDir: string, hooks: string[] = []) {
  return hooks.map((name) => ({
    name,
    policyKind: readPolicyKind(join(cardDir, "hooks", name, "policy.ts")),
    summary: readHookReadmeSummary(join(cardDir, "hooks", name, "README.md")),
  }));
}

export class CardShowCommand extends BaseCommand {
  static override paths = [["card", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Show a published card version resolved from a name or range.",
    details: `
      Resolves the requested card ref against the local store and prints the
      exact version, store path, requested range, and integrity hash.
    `,
    examples: [
      ["Show an exact card version", "drwn card show @your-handle/backend@1.0.0"],
      ["Show the latest satisfying version", "drwn card show @your-handle/backend@^1.0.0"],
    ],
  });

  ref = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve the card ref even when trustedSources.strict would reject it.",
  });

  async execute() {
    try {
      if (this.allowUntrustedSource) {
        this.context.stderr.write(`Warning: --allow-untrusted-source used for ${this.ref}\n`);
      }
      const card = await resolveCard(this.context.agentsDir, this.ref, {
        allowUntrustedSource: this.allowUntrustedSource,
        repoRoot: this.context.repoRoot,
        cwd: this.context.cwd,
      });
      const history = card.git
        ? await git.log(resolveCardBareRepoPath(this.context.agentsDir, card.name), { maxCount: 10, ref: card.git.commit })
        : [];
      const hookPolicies = readHookSummaries(card.dir, card.manifest.hooks?.include ?? []);
      if (this.json) {
        this.context.stdout.write(renderJson({ ...card, history, hookPolicies }));
        return 0;
      }
      const rows = [
        ["name", card.name],
        ["version", card.version],
        ["requested", card.requested],
        ["path", card.dir],
        ["integrity", card.integrity],
        ...(card.manifest.stability ? [["stability", card.manifest.stability]] : []),
        ...(card.manifest.lastValidatedWith ? [["lastValidatedWith", card.manifest.lastValidatedWith]] : []),
        ...(card.manifest.testStatusBadge ? [["testStatusBadge", card.manifest.testStatusBadge]] : []),
        ...(hookPolicies.length > 0
          ? [[
              "hooks",
              hookPolicies.map((hook) =>
                `${hook.name} (${hook.policyKind})${hook.summary ? ` - ${hook.summary}` : ""}`
              ).join("; "),
            ]]
          : []),
        ["history", history.map((entry) => `${entry.commit.slice(0, 12)} ${entry.subject}`).join("; ")],
      ];
      this.context.stdout.write(
        renderTable(
          ["field", "value"],
          rows,
        ),
      );
      return 0;
    } catch (error) {
      const code = error instanceof DrwnError ? error.code : "CARD_SHOW_FAILED";
      const message = error instanceof Error ? error.message : String(error);
      if (this.json) {
        this.context.stdout.write(renderJson({ ok: false, code, message }));
      } else {
        this.context.stderr.write(`${code}: ${message}\n`);
      }
      return 1;
    }
  }
}
