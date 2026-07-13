// ABOUTME: Maintains the active bridge policy and fail-closed hot reload behavior.
// ABOUTME: Keeps startup invalid policies fatal while retaining prior-good reloads.

import { loadPolicyFile, type BridgePolicy, type PolicyParseOptions } from "./load";

export interface PolicyStoreOptions extends PolicyParseOptions {
  logger?: (message: string) => void;
}

export class FilePolicyStore {
  private constructor(
    private readonly path: string,
    private active: BridgePolicy,
    private readonly options: PolicyStoreOptions,
  ) {}

  static async load(path: string, options: PolicyStoreOptions = {}) {
    return new FilePolicyStore(path, await loadPolicyFile(path, options), options);
  }

  current() {
    return this.active;
  }

  async reload() {
    try {
      this.active = await loadPolicyFile(this.path, this.options);
      return true;
    } catch (error) {
      this.options.logger?.(`policy reload failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
