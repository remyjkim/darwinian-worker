// ABOUTME: Verifies trustedSources matching, merging, and rejection behavior.
// ABOUTME: Keeps supply-chain policy checks independent from Git clone side effects.

import { describe, expect, test } from "bun:test";
import { assertCatalogSourceTrusted, assertSourceTrusted, mergeTrustedSourcesPolicies } from "../cli/core/trusted-sources";

describe("assertSourceTrusted", () => {
  test("allows everything when policy is unset or non-strict", () => {
    const parsed = {
      origin: "git" as const,
      gitUrl: "https://github.com/whoever/whatever.git",
      name: "",
      range: "*",
      original: "github:whoever/whatever@1.0.0",
    };
    expect(() => assertSourceTrusted(parsed, undefined)).not.toThrow();
    expect(() => assertSourceTrusted(parsed, { strict: false, gitOwners: ["acme"] })).not.toThrow();
  });

  test("accepts trusted git owners and rejects untrusted owners in strict mode", () => {
    expect(() =>
      assertSourceTrusted(
        {
          origin: "git",
          gitUrl: "https://github.com/acme/card.git",
          name: "",
          range: "*",
          original: "github:acme/card@1.0.0",
        },
        { strict: true, gitOwners: ["acme"] },
      ),
    ).not.toThrow();

    expect(() =>
      assertSourceTrusted(
        {
          origin: "git",
          gitUrl: "https://github.com/random/card.git",
          name: "",
          range: "*",
          original: "github:random/card@1.0.0",
        },
        { strict: true, gitOwners: ["acme"] },
      ),
    ).toThrow(/CARD_SOURCE_UNTRUSTED/);
  });

  test("accepts store refs by catalog scope and file refs by explicit ref", () => {
    expect(() =>
      assertSourceTrusted(
        { origin: "store", name: "@community/backend", range: "*", original: "@community/backend" },
        { strict: true, catalogScopes: ["@community"] },
      ),
    ).not.toThrow();

    expect(() =>
      assertSourceTrusted(
        { origin: "file", name: "file:/tmp/card", range: "*", filePath: "/tmp/card", original: "file:/tmp/card" },
        { strict: true, refs: ["file:/tmp/card"] },
      ),
    ).not.toThrow();
  });
});

describe("assertCatalogSourceTrusted", () => {
  test("applies trusted git host and explicit ref rules to catalog URLs", () => {
    expect(() =>
      assertCatalogSourceTrusted("https://github.com/curation-labs/dm-cards-catalog-v1.git", {
        strict: true,
        gitHosts: ["github.com"],
      }),
    ).not.toThrow();

    expect(() =>
      assertCatalogSourceTrusted("file:///tmp/catalog.git", {
        strict: true,
        refs: ["file:///tmp/catalog.git"],
      }),
    ).not.toThrow();
  });
});

describe("mergeTrustedSourcesPolicies", () => {
  test("keeps strict sticky and unions allowlists", () => {
    expect(
      mergeTrustedSourcesPolicies([
        { strict: true, gitOwners: ["acme"], refs: ["github:acme/a@1.0.0"] },
        { strict: false, gitOwners: ["community"], catalogScopes: ["@community"] },
      ]),
    ).toEqual({
      strict: true,
      gitHosts: [],
      gitOwners: ["acme", "community"],
      catalogScopes: ["@community"],
      refs: ["github:acme/a@1.0.0"],
    });
  });
});
