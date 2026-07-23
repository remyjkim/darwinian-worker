// ABOUTME: Shared presenter for errors caught by drwn worker commands.
// ABOUTME: Reserves the "Cannot reach Deploy API" banner for genuine connectivity failures (I65 Fix 3).

import { JwtAudienceError } from "./auth/jwt";
import { NotAuthenticatedError } from "./worker-http";

export function describeWorkerError(error: unknown, apiBaseUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof NotAuthenticatedError || error instanceof JwtAudienceError) {
    return message;
  }
  return `Cannot reach Deploy API at ${apiBaseUrl}: ${message}`;
}
