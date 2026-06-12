// ABOUTME: Wraps non-critical hooks so failures are logged instead of thrown.
// ABOUTME: Provides a small reusable guard for generated hook runtimes.

export interface HookLogger {
  error(data: unknown, message?: string): void;
}

export function safeHook<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<void> | void,
  logger: HookLogger,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (error) {
      logger.error({ hook: name, error }, "hook failed");
    }
  };
}
