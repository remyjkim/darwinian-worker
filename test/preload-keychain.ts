// ABOUTME: Test preload that points the secret store at a file-backed keychain.
// ABOUTME: Keeps credential encryption tests off the real OS keychain; production never sets this.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.DRWN_TEST_KEYCHAIN_DIR) {
  process.env.DRWN_TEST_KEYCHAIN_DIR = mkdtempSync(join(tmpdir(), "drwn-test-keychain-"));
}
