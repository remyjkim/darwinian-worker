// ABOUTME: Provides deterministic consent gates for drwn-command-bridge tests.
// ABOUTME: Models an alternate out-of-band channel without mocking policy code.

import type { ConsentGate, ConsentRequest } from "../../src/consent/gate";

export class FakeConsentGate implements ConsentGate {
  calls = 0;
  requests: ConsentRequest[] = [];

  constructor(private approvals: boolean[] = []) {}

  approveNext() {
    this.approvals.push(true);
  }

  denyNext() {
    this.approvals.push(false);
  }

  async request(req: ConsentRequest) {
    this.calls += 1;
    this.requests.push(req);
    return this.approvals.shift() ?? false;
  }
}
