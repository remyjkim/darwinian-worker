// ABOUTME: Covers shared-schema catalog validation used by CLI and GitHub Actions.
// ABOUTME: Protects the current community catalog shape and useful failure messages.

import { describe, expect, test } from "bun:test";
import { validateCatalogJson } from "../cli/core/catalog-validation";

describe("validateCatalogJson", () => {
  test("accepts the current community catalog shape with dh-card-base", () => {
    const result = validateCatalogJson({
      catalogVersion: 1,
      scope: "@community",
      description: "Curation Labs Darwinian Harness Cards Catalog V1",
      homepage: "https://github.com/curation-labs/dh-cards-catalog-v1",
      cards: [
        {
          name: "dh-card-base",
          url: "git+https://github.com/remyjkim/dh-card-base.git#v0.1.0",
          description: "Personal base card bundling the current-lane Darwinian Harness skills.",
          tags: ["harness", "skills"],
        },
      ],
      maintainers: [{ name: "Curation Labs" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.cards[0]?.name).toBe("dh-card-base");
    }
  });

  test("rejects unsupported catalog version", () => {
    const result = validateCatalogJson({
      catalogVersion: 2,
      scope: "@community",
      cards: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("catalogVersion");
    }
  });

  test("rejects non-GitHub URLs by default", () => {
    const result = validateCatalogJson({
      catalogVersion: 1,
      scope: "@community",
      cards: [
        {
          name: "backend",
          url: "https://gitlab.com/x/y.git#v1.0.0",
        },
      ],
    });

    expect(result.ok).toBe(false);
  });
});
