// ABOUTME: Default probe runners for authoring-scope auto-derivation.
// ABOUTME: Bun-native subprocess; absent `gh` or `git` is treated as a clean null, never a throw.

export async function defaultProbeGh(): Promise<string | null> {
  return runCapturing(["gh", "api", "user", "-q", ".login"]);
}

export async function defaultProbeGit(args: string[]): Promise<string | null> {
  return runCapturing(["git", ...args]);
}

async function runCapturing(cmd: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    const text = (await new Response(proc.stdout).text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
