// ABOUTME: Verifies global inventory ownership, stale recovery, and lock ordering.
// ABOUTME: Prevents per-record races and inventory-to-machine-to-project inversions.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { withInventoryLock, withMachineLock } from "../cli/core/inventory-lock";
import { withProjectStateLock } from "../cli/core/project-state-transaction";
import { resolveInventoryLockPath } from "../cli/core/store-paths";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inventory-lock-"));
  roots.push(root);
  return { root, agentsDir: join(root, ".agents") };
}

function owner(overrides: Partial<{ id: string; hostname: string; pid: number }> = {}) {
  return {
    version: 1,
    id: overrides.id ?? "existing-owner",
    hostname: overrides.hostname ?? hostname(),
    pid: overrides.pid ?? process.pid,
    startedAt: "2026-07-13T00:00:00.000Z",
  };
}

describe("inventory mutation lock", () => {
  test("is reentrant and permits inventory to machine to sorted projects", async () => {
    const state = await fixture();
    const a = join(state.root, "a-project");
    const b = join(state.root, "b-project");

    const ids = await withInventoryLock(state.agentsDir, async (inventory) =>
      withInventoryLock(state.agentsDir, async (again) => {
        expect(again.id).toBe(inventory.id);
        return withMachineLock(state.agentsDir, async () =>
          withProjectStateLock(a, async () =>
            withProjectStateLock(b, async () => [inventory.id, again.id])
          )
        );
      })
    );

    expect(ids[0]).toBe(ids[1]);
  });

  test("rejects inversion and reverse project ordering", async () => {
    const state = await fixture();
    const a = join(state.root, "a-project");
    const b = join(state.root, "b-project");

    await expect(
      withProjectStateLock(a, () => withInventoryLock(state.agentsDir, async () => undefined)),
    ).rejects.toMatchObject({ code: "INVENTORY_LOCK_ORDER_VIOLATION" });
    await expect(
      withInventoryLock(state.agentsDir, () =>
        withMachineLock(state.agentsDir, () =>
          withProjectStateLock(b, () => withProjectStateLock(a, async () => undefined))
        )
      ),
    ).rejects.toMatchObject({ code: "INVENTORY_LOCK_ORDER_VIOLATION" });
  });

  test("reports a live owner without changing its lock", async () => {
    const state = await fixture();
    const path = resolveInventoryLockPath(state.agentsDir);
    await mkdir(join(state.agentsDir, "drwn"), { recursive: true });
    const bytes = `${JSON.stringify(owner(), null, 2)}\n`;
    await writeFile(path, bytes);

    await expect(withInventoryLock(state.agentsDir, async () => undefined)).rejects.toMatchObject({
      code: "INVENTORY_TRANSACTION_BUSY",
    });
    expect(await Bun.file(path).text()).toBe(bytes);
  });

  test("quarantines a provably dead same-host owner", async () => {
    const state = await fixture();
    const path = resolveInventoryLockPath(state.agentsDir);
    const parent = join(state.agentsDir, "drwn");
    await mkdir(parent, { recursive: true });
    await writeFile(path, `${JSON.stringify(owner({ pid: 2_147_483_647 }), null, 2)}\n`);

    await withInventoryLock(state.agentsDir, async () => undefined);

    expect((await readdir(parent)).some((name) => name.startsWith(".inventory-transaction.lock.stale.existing-owner."))).toBe(true);
  });

  test.each([
    ["malformed", "not-json\n"],
    ["foreign", `${JSON.stringify(owner({ hostname: "another-host" }), null, 2)}\n`],
  ] as const)("fails closed for a %s owner record", async (_label, bytes) => {
    const state = await fixture();
    const path = resolveInventoryLockPath(state.agentsDir);
    await mkdir(join(state.agentsDir, "drwn"), { recursive: true });
    await writeFile(path, bytes);

    await expect(withInventoryLock(state.agentsDir, async () => undefined)).rejects.toMatchObject({
      code: "INVENTORY_TRANSACTION_LOCK_UNRECOVERABLE",
    });
    expect(await Bun.file(path).text()).toBe(bytes);
  });
});
