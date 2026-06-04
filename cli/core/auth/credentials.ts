// ABOUTME: Reads, writes, and deletes the drwn analyzer credentials file.
// ABOUTME: Writes are atomic and owner-only so bearer tokens do not get broad file permissions.

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface DrwnCredentials {
  api_url: string;
  access_token: string;
  user_email: string;
  saved_at: string;
}

function isCredentials(value: unknown): value is DrwnCredentials {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.api_url === "string" &&
    typeof record.access_token === "string" &&
    typeof record.user_email === "string" &&
    typeof record.saved_at === "string"
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export async function readCredentials(path: string): Promise<DrwnCredentials | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }

  try {
    const parsed = JSON.parse(raw);
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCredentials(path: string, creds: DrwnCredentials): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.credentials.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, path);
}

export async function deleteCredentials(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}
