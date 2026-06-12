// ABOUTME: Implements drwn catalog validate for pre-merge catalog.json checks.
// ABOUTME: Used by GitHub Actions on catalog repos.

import { Option } from "clipanion";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  validateCatalogDeep,
  validateCatalogJson,
} from "../../core/catalog-validation";
import { DrwnError } from "../../core/errors";
import * as git from "../../core/git";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CatalogValidateCommand extends BaseCommand {
  static override paths = [["catalog", "validate"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Validate a catalog.json file.",
    details: `
      Validates a catalog.json file against the shared upstream schema. Use
      --deep to additionally resolve each card ref and verify the resolved card
      name matches the catalog entry.
    `,
    examples: [
      ["Validate local catalog", "drwn catalog validate ./catalog.json"],
      ["Validate remote catalog", "drwn catalog validate https://github.com/owner/repo"],
      ["Deep validation", "drwn catalog validate ./catalog.json --deep"],
    ],
  });

  target = Option.String({ required: true });

  deep = Option.Boolean("--deep", false, {
    description: "Resolve each card URL and verify catalog entry consistency.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve card refs even when trustedSources.strict would reject them.",
  });

  async execute() {
    try {
      const text = await readCatalogTarget(this.target);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return this.fail(["catalog: Invalid JSON", error instanceof Error ? error.message : String(error)]);
      }

      const shallow = validateCatalogJson(parsed);
      if (!shallow.ok) {
        return this.fail(shallow.errors);
      }

      if (this.deep) {
        if (this.allowUntrustedSource) {
          this.context.stderr.write(`Warning: --allow-untrusted-source used for catalog ${this.target}\n`);
        }
        const validationRoot = await mkdtemp(join(tmpdir(), "drwn-catalog-deep-"));
        try {
          const deep = await validateCatalogDeep(shallow.catalog, {
            agentsDir: join(validationRoot, ".agents"),
            allowUntrustedSource: this.allowUntrustedSource,
            repoRoot: this.context.repoRoot,
            cwd: this.context.cwd,
          });
          if (!deep.ok) {
            return this.fail(deep.errors);
          }
        } finally {
          await rm(validationRoot, { recursive: true, force: true });
        }
      }

      const payload = { ok: true, cardCount: shallow.catalog.cards.length };
      this.context.stdout.write(
        this.json ? renderJson(payload) : `Valid catalog.json (${payload.cardCount} cards)\n`,
      );
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.fail([message]);
    }
  }

  private fail(errors: string[]) {
    if (this.json) {
      this.context.stdout.write(renderJson({ ok: false, errors }));
    } else {
      this.context.stderr.write(`${errors.join("\n")}\n`);
    }
    return 1;
  }
}

async function readCatalogTarget(target: string): Promise<string> {
  const localPath = resolve(target);
  if (existsSync(localPath)) {
    return await readFile(localPath, "utf8");
  }
  const repoUrl = normalizeCatalogRepoUrl(target);
  if (!repoUrl) {
    throw new DrwnError("CATALOG_NOT_FOUND", `catalog target not found: ${target}`);
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "drwn-catalog-validate-"));
  const barePath = join(tempRoot, "catalog.git");
  try {
    await git.cloneBare(repoUrl, barePath, { depth: 1 });
    return await git.showBlob(barePath, "HEAD:catalog.json");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function normalizeCatalogRepoUrl(target: string): string | null {
  if (target.startsWith("git+")) {
    return target.slice("git+".length);
  }
  if (target.startsWith("github:")) {
    const body = target.slice("github:".length).replace(/\.git$/, "");
    if (!/^[^/]+\/[^/]+$/.test(body)) {
      return null;
    }
    return `https://github.com/${body}.git`;
  }
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/.test(target)) {
    return target.replace(/\/$/, "").replace(/\.git$/, "") + ".git";
  }
  if (/^(?:https?|ssh|file):\/\//.test(target) || target.startsWith("git@")) {
    return target;
  }
  return null;
}
