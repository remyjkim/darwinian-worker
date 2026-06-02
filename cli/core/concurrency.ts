// ABOUTME: Provides bounded-concurrency helpers for parallel I/O operations.
// ABOUTME: Used by drwn install and drwn card outdated --fetch to parallelize Git operations.

/**
 * Read the user-configured fetch concurrency from the environment.
 *
 * Defaults to 4 when DRWN_FETCH_CONCURRENCY is unset or invalid. Values are
 * clamped to a minimum of 1 (concurrency 0 would deadlock; negative concurrency
 * is meaningless).
 */
export function resolveFetchConcurrency(): number {
  const raw = process.env.DRWN_FETCH_CONCURRENCY;
  if (raw === undefined || raw === "") return 4;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 4;
  return parsed;
}

/**
 * Map over an iterable with bounded concurrency. Results preserve input order.
 *
 * Each `fn(item, index)` call is awaited independently; up to `concurrency`
 * promises run in parallel. If `fn` throws for one item, other in-flight work
 * still runs to completion before this helper rejects (so callers see the
 * widest possible view of failures rather than racing on the first error).
 *
 * Callers that need fail-fast behavior should reject inside `fn` themselves
 * and wrap with `Promise.race` or similar — this helper deliberately favors
 * coverage over early termination.
 */
export async function pMap<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  const errors: unknown[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: effectiveConcurrency }, async () => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i] as T, i);
      } catch (error) {
        errors.push(error);
      }
    }
  });
  await Promise.all(workers);
  if (errors.length > 0) {
    // Re-throw the first error; callers that want all errors should accumulate
    // them inside `fn` instead of throwing.
    throw errors[0];
  }
  return results;
}
