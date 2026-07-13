// ABOUTME: Seeds standalone MCP records for tests through production record-scoped APIs.
// ABOUTME: Avoids restoring the removed whole-inventory persistence interface.

import { createMcpLibraryRecord, loadMcpLibrary } from "../cli/core/mcp-library";
import type { UserMcpLibrary } from "../cli/core/types";

export { loadMcpLibrary };

export async function seedMcpInventory(agentsDir: string, library: UserMcpLibrary) {
  for (const [id, server] of Object.entries(library.servers)) {
    await createMcpLibraryRecord(agentsDir, id, server);
  }
}
