// ABOUTME: Promise timeout helper for hook composition.
// ABOUTME: Rejects with a typed error so the composer can apply policy semantics.

export class HookTimeoutError extends Error {
  constructor(public ms: number) {
    super(`timeout after ${ms}ms`);
    this.name = "HookTimeoutError";
  }
}

export async function runWithTimeout<T>(value: Promise<T> | T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HookTimeoutError(ms)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(value), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
