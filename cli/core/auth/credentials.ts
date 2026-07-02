// ABOUTME: Reads, writes, and deletes DAH-backed drwn CLI credentials.
// ABOUTME: The credential payload is encrypted at rest under an OS-keychain-held key.

import { clear, decryptFromDisk, encryptToDisk } from "../secret-store";

export interface CliDahCredentialFile {
  version: 2;
  issuer: string;
  clientId: "drwn-cli";
  resource: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user_email: string;
  saved_at: string;
  api_url?: string;
  access_token?: string;
}

export interface DrwnCredentials {
  api_url: string;
  access_token: string;
  user_email: string;
  saved_at: string;
}

function isCredentials(value: unknown): value is CliDahCredentialFile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 2 &&
    record.clientId === "drwn-cli" &&
    typeof record.issuer === "string" &&
    typeof record.resource === "string" &&
    typeof record.accessToken === "string" &&
    typeof record.refreshToken === "string" &&
    typeof record.expiresAt === "string" &&
    typeof record.saved_at === "string" &&
    typeof record.user_email === "string" &&
    !Number.isNaN(Date.parse(record.expiresAt))
  );
}

export async function readCredentials(path: string): Promise<CliDahCredentialFile | DrwnCredentials | null> {
  const plaintext = await decryptFromDisk(path);
  if (plaintext === null) return null;
  try {
    const parsed = JSON.parse(plaintext);
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCredentials(path: string, creds: CliDahCredentialFile | DrwnCredentials): Promise<void> {
  await encryptToDisk(path, JSON.stringify(creds, null, 2));
}

export async function deleteCredentials(path: string): Promise<void> {
  await clear(path);
}
