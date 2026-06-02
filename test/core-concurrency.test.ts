// ABOUTME: Verifies bounded-concurrency helpers used by install and outdated --fetch.
// ABOUTME: Confirms order preservation, concurrency bound, and error semantics.

import { describe, expect, test } from "bun:test";
import { pMap, resolveFetchConcurrency } from "../cli/core/concurrency";

describe("pMap", () => {
  test("preserves input order in results", async () => {
    const input = [10, 20, 30, 40, 5];
    const output = await pMap(input, 2, async (value) => value * 2);
    expect(output).toEqual([20, 40, 60, 80, 10]);
  });

  test("honors the concurrency cap", async () => {
    let inFlight = 0;
    let observedPeak = 0;
    const fn = async (n: number) => {
      inFlight += 1;
      observedPeak = Math.max(observedPeak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return n;
    };
    await pMap([1, 2, 3, 4, 5, 6, 7, 8], 3, fn);
    expect(observedPeak).toBeLessThanOrEqual(3);
    expect(observedPeak).toBeGreaterThan(1);
  });

  test("runs faster than sequential at concurrency > 1", async () => {
    const sleepMs = 60;
    const items = [0, 0, 0, 0];
    const fn = async () => {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    };

    const startParallel = Date.now();
    await pMap(items, 4, fn);
    const parallelElapsed = Date.now() - startParallel;

    const startSerial = Date.now();
    await pMap(items, 1, fn);
    const serialElapsed = Date.now() - startSerial;

    // Parallel with concurrency=4 should take ~sleepMs (one batch); sequential
    // takes ~4*sleepMs. Allow some slop for the test runner.
    expect(parallelElapsed).toBeLessThan(serialElapsed * 0.75);
  });

  test("rethrows the first error after all in-flight work settles", async () => {
    const failures: Array<{ index: number; thrownAt: number }> = [];
    const fn = async (value: number, index: number) => {
      if (value === 2 || value === 4) {
        failures.push({ index, thrownAt: Date.now() });
        throw new Error(`failed at index ${index}`);
      }
      return value;
    };
    await expect(pMap([1, 2, 3, 4, 5], 2, fn)).rejects.toThrow(/failed at index/);
    // Both failures should have been reached, not just the first one.
    expect(failures).toHaveLength(2);
  });

  test("returns immediately for an empty array", async () => {
    const result = await pMap([], 4, async () => {
      throw new Error("should not be called");
    });
    expect(result).toEqual([]);
  });

  test("works with concurrency higher than item count", async () => {
    const result = await pMap([1, 2, 3], 100, async (value) => value);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("resolveFetchConcurrency", () => {
  test("defaults to 4 when env var is unset", () => {
    const previous = process.env.DRWN_FETCH_CONCURRENCY;
    delete process.env.DRWN_FETCH_CONCURRENCY;
    try {
      expect(resolveFetchConcurrency()).toBe(4);
    } finally {
      if (previous !== undefined) process.env.DRWN_FETCH_CONCURRENCY = previous;
    }
  });

  test("honors a valid env override", () => {
    const previous = process.env.DRWN_FETCH_CONCURRENCY;
    process.env.DRWN_FETCH_CONCURRENCY = "8";
    try {
      expect(resolveFetchConcurrency()).toBe(8);
    } finally {
      if (previous === undefined) delete process.env.DRWN_FETCH_CONCURRENCY;
      else process.env.DRWN_FETCH_CONCURRENCY = previous;
    }
  });

  test("clamps invalid values to the default", () => {
    const previous = process.env.DRWN_FETCH_CONCURRENCY;
    process.env.DRWN_FETCH_CONCURRENCY = "0";
    try {
      expect(resolveFetchConcurrency()).toBe(4);
    } finally {
      if (previous === undefined) delete process.env.DRWN_FETCH_CONCURRENCY;
      else process.env.DRWN_FETCH_CONCURRENCY = previous;
    }

    process.env.DRWN_FETCH_CONCURRENCY = "abc";
    try {
      expect(resolveFetchConcurrency()).toBe(4);
    } finally {
      if (previous === undefined) delete process.env.DRWN_FETCH_CONCURRENCY;
      else process.env.DRWN_FETCH_CONCURRENCY = previous;
    }
  });
});
