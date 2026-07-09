// ABOUTME: Resolves the BeginningDB connection for mind operations from BGDB_* environment variables.
// ABOUTME: Environment is the sole source in local/test flows; deploy flows populate it from the mind binding.

import { DrwnError } from "../errors";

export interface BgdbConfig {
  baseUrl: string;
  token: string;
  tenantId?: number;
  pathPrefix?: string;
}

export function resolveBgdbConfig(env: NodeJS.ProcessEnv = process.env): BgdbConfig {
  const baseUrl = env.BGDB_BASE_URL;
  const token = env.BGDB_TOKEN;
  if (!baseUrl || !token) {
    throw new DrwnError(
      "MIND_BINDING_NOT_FOUND",
      "No BeginningDB binding available: set BGDB_BASE_URL and BGDB_TOKEN (and BGDB_TENANT_ID for direct mode), or deploy the worker so the binding can be fetched.",
      ["export BGDB_BASE_URL=… BGDB_TOKEN=…", "drwn worker deploy <ref> --name <worker>"],
    );
  }
  const tenantRaw = env.BGDB_TENANT_ID;
  const tenantId = tenantRaw === undefined || tenantRaw === "" ? undefined : Number(tenantRaw);
  if (tenantId !== undefined && !Number.isInteger(tenantId)) {
    throw new DrwnError("MIND_BINDING_NOT_FOUND", `BGDB_TENANT_ID must be an integer, got: ${tenantRaw}`);
  }
  return {
    baseUrl,
    token,
    ...(tenantId !== undefined ? { tenantId } : {}),
    ...(env.BGDB_PATH_PREFIX ? { pathPrefix: env.BGDB_PATH_PREFIX } : {}),
  };
}
