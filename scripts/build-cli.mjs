#!/usr/bin/env node
// ABOUTME: Builds the distributable drwn CLI entrypoint for npm packaging.
// ABOUTME: Uses Bun for TypeScript bundling, then normalizes the generated artifact for Node runtime.

import { spawn } from "node:child_process";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outFile = join(repoRoot, "dist", "index.js");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        process.stderr.write(Buffer.concat(stdout).toString("utf8"));
        process.stderr.write(Buffer.concat(stderr).toString("utf8"));
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

await rm(join(repoRoot, "dist"), { recursive: true, force: true });
await run("bun", [
  "build",
  "cli/index.ts",
  "--target=node",
  "--format=esm",
  `--outfile=${outFile}`,
]);

const generated = await readFile(outFile, "utf8");
const normalized = generated
  .replace(/^#!\/usr\/bin\/env bun\n/, "#!/usr/bin/env node\n")
  .replace(/^\/\/ @bun\n/, "");
await writeFile(outFile, normalized);
await chmod(outFile, 0o755);
