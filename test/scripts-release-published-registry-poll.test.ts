// ABOUTME: Exercises the workflow's actual registry polling loops with a transient tar 404.
// ABOUTME: Verifies both platforms wait for bytes, and fail closed when bytes never arrive.

import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(
  join(import.meta.dir, "..", ".github", "workflows", "release-verify-published.yml"),
  "utf8",
);
const loops = [...workflow.matchAll(/^          for ATTEMPT in \$\(seq 1 30\); do\n[\s\S]*?^          done$/gm)]
  .map((match) => match[0].replace(/^          /gm, ""));
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function executable(path: string, body: string): void {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function probe(
  loop: string,
  succeedAt: number,
  tamperedTar = false,
): { status: number | null; attempts: number; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "drwn-published-probe-"));
  temporary.push(root);
  const bin = join(root, "bin");
  const candidate = join(root, "candidate");
  const published = join(root, "published");
  mkdirSync(bin);
  mkdirSync(candidate);
  mkdirSync(published);
  const tar = join(root, "source.tgz");
  writeFileSync(tar, "known qualified registry bytes");
  const sha = createHash("sha256").update(readFileSync(tar)).digest("hex");
  const alteredTar = join(root, "altered.tgz");
  writeFileSync(alteredTar, "different registry bytes");
  writeFileSync(join(root, "candidate-artifact.json"), JSON.stringify({ sha256: sha }));
  writeFileSync(join(candidate, "release-candidate.json"), "{}");
  const counter = join(root, "attempts");
  writeFileSync(counter, "0");

  executable(join(bin, "npm"), `
printf '%s\\n' '{"version":"1.4.2","dist.shasum":"valid","dist.integrity":"valid","dist.tarball":"https://registry.npmjs.org/darwinian/-/darwinian-1.4.2.tgz"}'
`);
  executable(join(bin, "bun"), `
case "$2" in
  verify-registry) printf '%s\\n' '{}' ;;
  requalify-artifact) printf '{"sha256":"%s"}\\n' "$EXPECTED_SHA" ;;
  *) exit 2 ;;
esac
`);
  executable(join(bin, "curl"), `
count="$(<"$PROBE_COUNT_PATH")"
count="$((count + 1))"
printf '%s' "$count" > "$PROBE_COUNT_PATH"
if [ "$count" -lt "$PROBE_SUCCEED_AT" ]; then exit 22; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    cp "$TARBALL_FIXTURE" "$2"
    exit 0
  fi
  shift
done
exit 2
`);
  executable(join(bin, "sleep"), "exit 0");

  const script = `set -e
VERIFIED=0
TARBALL_URL="https://registry.npmjs.org/darwinian/-/darwinian-1.4.2.tgz"
${loop}
test "$VERIFIED" = "1"
`;
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: root,
      EXPECTED_SHA: sha,
      PROBE_COUNT_PATH: counter,
      PROBE_SUCCEED_AT: String(succeedAt),
      TARBALL_FIXTURE: tamperedTar ? alteredTar : tar,
    },
  });
  return { status: result.status, attempts: Number(readFileSync(counter, "utf8")), stderr: result.stderr };
}

describe("published-candidate registry readiness", () => {
  test("both platform loops retry a metadata-visible but unavailable tar", () => {
    expect(loops).toHaveLength(2);
    expect(workflow.match(/test "\$VERIFIED" = "1"/g)).toHaveLength(2);
    for (const loop of loops) {
      const result = probe(loop, 2);
      expect(result.status).toBe(0);
      expect(result.attempts).toBe(2);
    }
  });

  test("both platform loops refuse when the tar never becomes available", () => {
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      const result = probe(loop, 31);
      expect(result.status).not.toBe(0);
      expect(result.attempts).toBe(30);
    }
  });

  test("both platform loops refuse a reachable tar with the wrong bytes", () => {
    for (const loop of loops) {
      const result = probe(loop, 1, true);
      expect(result.status).not.toBe(0);
      expect(result.attempts).toBe(30);
    }
  });
});
