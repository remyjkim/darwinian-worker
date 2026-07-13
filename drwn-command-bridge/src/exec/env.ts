// ABOUTME: Builds minimal child-process environments from policy allowlists.
// ABOUTME: Avoids spreading host process.env into bridge-spawned commands.

import type { BridgePolicy } from "../policy/load";

const posixBaseKeys = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"];
const windowsBaseKeys = ["Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "PATHEXT", "COMSPEC"];
const defaultPosixPath = "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin";

function baseKeysForPlatform(platform: NodeJS.Platform) {
  return platform === "win32" ? windowsBaseKeys : posixBaseKeys;
}

export function buildEnv(
  requestEnv: Record<string, string>,
  policy: Pick<BridgePolicy, "envAllow">,
  platform: NodeJS.Platform = process.platform,
) {
  const env: Record<string, string> = {};
  for (const key of baseKeysForPlatform(platform)) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (platform !== "win32" && env.PATH === undefined) {
    env.PATH = defaultPosixPath;
  }

  const allowed = new Set(policy.envAllow);
  for (const [key, value] of Object.entries(requestEnv)) {
    if (!allowed.has(key)) {
      throw new Error(`Environment key is not allowlisted: ${key}`);
    }
    env[key] = value;
  }
  return env;
}
