// ABOUTME: Exposes standalone inventory transfer and dry-run garbage collection under drwn machine.
// ABOUTME: Keeps portable installation additive, inactive, and separate from whole-Store state.

import { Option } from "clipanion";
import { createPortableInventoryBundle, readPortableInventoryArtifact } from "../../core/inventory-bundle";
import { planInventoryGc, pruneInventoryGc } from "../../core/inventory-gc";
import {
  comparePortableInventory,
  exportPortableInventoryManifest,
  syncPortableInventory,
} from "../../core/inventory-transfer";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

abstract class InventoryJsonCommand extends BaseCommand {
  json = Option.Boolean("--json", false);

  protected output(payload: unknown, human: string) {
    this.context.stdout.write(this.json ? renderJson(payload) : `${human}\n`);
  }
}

export class MachineInventoryExportCommand extends InventoryJsonCommand {
  static override paths = [["machine", "inventory", "export"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Export canonical standalone inventory metadata.",
    details: `
      Writes deterministic canonical metadata for active standalone skill
      packages and MCP records. The manifest carries no payload bytes and all
      inventory remains inactive.
    `,
    examples: [["Export requirements metadata", "drwn machine inventory export --output ./inventory.json"]],
  });

  outputPath = Option.String("--output", { required: true });

  async execute() {
    const result = await exportPortableInventoryManifest({
      agentsDir: this.context.agentsDir,
      outputPath: this.outputPath,
    });
    this.output(
      result,
      `${result.action === "written" ? "Wrote" : "Manifest unchanged at"} ${result.outputPath} (${result.manifestSha256}).`,
    );
    return 0;
  }
}

export class MachineInventoryBundleCommand extends InventoryJsonCommand {
  static override paths = [["machine", "inventory", "bundle"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Bundle active standalone inventory for offline transfer.",
    details: `
      Writes a deterministic gzip bundle containing the canonical manifest and
      allowlisted active inventory bytes. The offline artifact excludes intent,
      credentials, Cards, and operational state; its entries remain inactive.
    `,
    examples: [["Create an offline bundle", "drwn machine inventory bundle --output ./inventory.tar.gz"]],
  });

  outputPath = Option.String("--output", { required: true });

  async execute() {
    const result = await createPortableInventoryBundle({
      agentsDir: this.context.agentsDir,
      outputPath: this.outputPath,
    });
    this.output(
      result,
      `${result.action === "written" ? "Wrote" : "Bundle unchanged at"} ${result.outputPath} (${result.archiveSha256}).`,
    );
    return 0;
  }
}

export class MachineInventoryVerifyCommand extends InventoryJsonCommand {
  static override paths = [["machine", "inventory", "verify"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Verify a portable manifest or bundle against local inventory.",
    details: `
      Performs read-only exact comparison of a strict manifest or bundle.
      Missing, conflicting, or extra inventory is valid drift reported with
      exit code 1; malformed artifacts fail as errors.
    `,
    examples: [["Verify an artifact", "drwn machine inventory verify --from ./inventory.tar.gz --json"]],
  });

  sourcePath = Option.String("--from", { required: true });

  async execute() {
    const artifact = await readPortableInventoryArtifact(this.sourcePath);
    try {
      const report = await comparePortableInventory({
        source: artifact.manifest,
        sourceKind: artifact.kind,
        agentsDir: this.context.agentsDir,
        repoRoot: this.context.repoRoot,
      });
      this.output(
        report,
        report.exact
          ? `Exact portable inventory match (${report.source.manifestSha256}).`
          : `Inventory drift: ${report.summary.missing} missing, ${report.summary.conflicting} conflicting, ${report.summary.extra} extra.`,
      );
      return report.exact ? 0 : 1;
    } finally {
      await artifact.cleanup();
    }
  }
}

export class MachineInventorySyncCommand extends InventoryJsonCommand {
  static override paths = [["machine", "inventory", "sync"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Additively sync missing standalone inventory from a bundle.",
    details: `
      Validates the complete bundle, blocks every conflict, preserves identical
      entries and extras, and installs only missing inventory. Sync never
      activates a skill or MCP server; --dry-run creates no managed state.
    `,
    examples: [
      ["Preview additive sync", "drwn machine inventory sync --from ./inventory.tar.gz --dry-run"],
      ["Install missing inactive entries", "drwn machine inventory sync --from ./inventory.tar.gz"],
    ],
  });

  sourcePath = Option.String("--from", { required: true });
  dryRun = Option.Boolean("--dry-run", false);

  async execute() {
    const result = await syncPortableInventory({
      agentsDir: this.context.agentsDir,
      repoRoot: this.context.repoRoot,
      sourcePath: this.sourcePath,
      dryRun: this.dryRun,
    });
    this.output(
      result,
      this.dryRun
        ? `Dry-run: ${result.summary.wouldInstall} would install, ${result.summary.identical} identical, ${result.summary.extra} extra; inventory remains inactive.`
        : `Installed ${result.summary.installed}, ${result.summary.identical} identical, ${result.summary.extra} extra; inventory remains inactive.`,
    );
    return 0;
  }
}

export class MachineInventoryGcCommand extends BaseCommand {
  static override paths = [["machine", "inventory", "gc"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Plan or prune scoped standalone inventory garbage.",
    details: `
      Runs as a dry-run by default. It may prune only old drwn temporary
      siblings, completed inventory tombstones, and old inactive immutable
      package versions; current inventory is never removed for having zero
      known references.
    `,
    examples: [
      ["Plan inventory GC", "drwn machine inventory gc --json"],
      ["Prune eligible inventory garbage", "drwn machine inventory gc --prune"],
    ],
  });

  prune = Option.Boolean("--prune", false);
  json = Option.Boolean("--json", false);

  async execute() {
    const result = this.prune
      ? await pruneInventoryGc(this.context.agentsDir)
      : await planInventoryGc(this.context.agentsDir);
    if (this.json) {
      this.context.stdout.write(renderJson(result));
    } else {
      this.context.stdout.write(
        `${result.mode === "prune" ? "Pruned" : "Dry-run:"} ${result.eligible.length} eligible, ${result.kept.length} kept, ${result.removed.length} removed.\n`,
      );
    }
    return 0;
  }
}
