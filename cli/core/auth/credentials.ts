// ABOUTME: Reads, writes, and deletes the drwn analyzer credentials, encrypted at rest.
// ABOUTME: Bearer tokens are AES-256-GCM encrypted under an OS-keychain-held key; never plaintext.

import { clear, decryptFromDisk, encryptToDisk } from "../secret-store";

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

export async function readCredentials(path: string): Promise<DrwnCredentials | null> {
  const plaintext = await decryptFromDisk(path);
  if (plaintext === null) return null;
  try {
    const parsed = JSON.parse(plaintext);
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCredentials(path: string, creds: DrwnCredentials): Promise<void> {
  await encryptToDisk(path, JSON.stringify(creds, null, 2));
}

export async function deleteCredentials(path: string): Promise<void> {
  await clear(path);
}
