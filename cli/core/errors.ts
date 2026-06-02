// ABOUTME: Defines shared typed errors for core drwn modules.
// ABOUTME: Gives commands stable error codes without importing CLI framework types.

export class DrwnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hints?: string[],
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DrwnError";
  }

  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      hints: this.hints,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}
