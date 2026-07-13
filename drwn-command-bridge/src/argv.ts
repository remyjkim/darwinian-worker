// ABOUTME: Parses command strings into argv arrays without shell expansion.
// ABOUTME: Keeps metacharacters literal so policy can inspect them before spawn.

export type ParsedCommand =
  | { ok: true; argv: string[] }
  | { ok: false; reason: string };

function isAsciiWhitespace(value: string) {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f" || value === "\v";
}

export function parseCommandString(command: string): ParsedCommand {
  const argv: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  let tokenStarted = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;

    if (escaping) {
      current += char;
      tokenStarted = true;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (isAsciiWhitespace(char)) {
      if (tokenStarted) {
        argv.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaping) {
    return { ok: false, reason: "Dangling escape in command string" };
  }
  if (quote) {
    return { ok: false, reason: `Unmatched ${quote} quote in command string` };
  }
  if (tokenStarted) {
    argv.push(current);
  }
  if (argv.length === 0) {
    return { ok: false, reason: "Command string did not contain a program" };
  }
  return { ok: true, argv };
}

export function parseCommandStringOrThrow(command: string): string[] {
  const parsed = parseCommandString(command);
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  return parsed.argv;
}
