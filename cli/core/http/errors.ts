// ABOUTME: Defines typed HTTP errors for analyzer client consumers.
// ABOUTME: Allows command layers to map auth expiry and server failures to stable UX.

export class AuthExpiredError extends Error {
  constructor() {
    super("auth_expired");
    this.name = "AuthExpiredError";
  }
}

export class ServerError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ServerError";
  }
}
