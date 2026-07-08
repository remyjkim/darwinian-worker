// ABOUTME: TTY-aware confirmation for destructive commands.
// ABOUTME: Non-interactive invocations must pass an explicit --yes; interactive ones get a y/N prompt.

export interface ConfirmStreams {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream & { isTTY?: boolean };
}

export async function confirmDestructive(question: string, yes: boolean, streams: ConfirmStreams): Promise<boolean> {
  if (yes) {
    return true;
  }
  if (!streams.stdin.isTTY || !streams.stdout.isTTY) {
    return false;
  }
  streams.stdout.write(`${question} [y/N] `);
  const answer = await new Promise<string>((resolve) => {
    streams.stdin.once("data", (chunk) => resolve(String(chunk).trim().toLowerCase()));
  });
  return answer === "y" || answer === "yes";
}
