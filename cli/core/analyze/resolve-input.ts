// ABOUTME: Resolves analyze-session archive input from flags and existing exports.
// ABOUTME: Keeps dry-run non-mutating by representing would-inline without creating files.

export interface ResolveInputOptions {
  archive?: string;
  fresh?: boolean;
  exportsDir: string;
  inlineExport: () => Promise<string>;
  findNewest: (dir: string) => Promise<string | null>;
  dryRun?: boolean;
}

export interface ResolvedAnalyzeInput {
  path: string | null;
  source: "explicit" | "fresh" | "existing" | "inline" | "would-inline";
}

export async function resolveAnalyzeInput(opts: ResolveInputOptions): Promise<ResolvedAnalyzeInput> {
  if (opts.archive) return { path: opts.archive, source: "explicit" };

  if (opts.dryRun) {
    const existing = opts.fresh ? null : await opts.findNewest(opts.exportsDir);
    if (existing) return { path: existing, source: "existing" };
    return { path: null, source: "would-inline" };
  }

  if (opts.fresh) return { path: await opts.inlineExport(), source: "fresh" };

  const existing = await opts.findNewest(opts.exportsDir);
  if (existing) return { path: existing, source: "existing" };
  return { path: await opts.inlineExport(), source: "inline" };
}
