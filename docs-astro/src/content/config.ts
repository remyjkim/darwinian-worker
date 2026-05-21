// ABOUTME: Defines the docs content collection schema
// ABOUTME: Single flat collection for quickstart and tutorial content

import { defineCollection, z } from "astro:content";

const docs = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    order: z.number(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { docs };
