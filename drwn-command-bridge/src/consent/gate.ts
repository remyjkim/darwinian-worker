// ABOUTME: Defines out-of-band consent interfaces and TTL-scoped approval caching.
// ABOUTME: Ensures approval state cannot be supplied by execute_command payloads.

import type { Risk } from "../schema";

export interface ConsentRequest {
  auditId: string;
  program: string;
  argv: string[];
  cwd: string;
  reason?: string;
  risk: Risk;
}

export interface ConsentGate {
  request(req: ConsentRequest): Promise<boolean>;
}

export class ConsentChannelUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentChannelUnavailable";
  }
}

function cacheKey(req: ConsentRequest) {
  return [req.risk, req.program, req.argv.slice(0, 2).join("\u0000"), req.cwd].join("\u0001");
}

export class CachedConsentGate implements ConsentGate {
  private readonly approvals = new Map<string, number>();

  constructor(
    private readonly inner: ConsentGate,
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async request(req: ConsentRequest): Promise<boolean> {
    if (this.ttlMs > 0) {
      const expiresAt = this.approvals.get(cacheKey(req));
      if (expiresAt !== undefined && expiresAt > this.now()) {
        return true;
      }
    }

    const approved = await this.inner.request(req);
    if (approved && this.ttlMs > 0) {
      this.approvals.set(cacheKey(req), this.now() + this.ttlMs);
    }
    return approved;
  }
}
