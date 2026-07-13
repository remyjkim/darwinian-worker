// ABOUTME: Defines strict Zod schemas for drwn-command-bridge tool input and output.
// ABOUTME: Exports raw shapes for MCP SDK registration and objects for tests.

import { z } from "zod";

export const riskSchema = z.enum(["low", "medium", "high"]);

export const executeInputShape = {
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout: z.number().int().positive().max(300000).optional(),
  env: z.record(z.string(), z.string()).optional(),
  reason: z.string().max(2000).optional(),
  shell: z.boolean().optional(),
};

export const executeOutputShape = {
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  timedOut: z.boolean(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }),
  decision: z.enum(["auto", "consented"]),
  auditId: z.string(),
};

export const listAllowedOutputShape = {
  rules: z.array(
    z.object({
      program: z.string(),
      risk: riskSchema,
      argsAllow: z.array(z.string()).optional(),
      pattern: z.string().optional(),
    }),
  ),
  consentRequiredAbove: riskSchema,
};

export const executeInputSchema = z.object(executeInputShape);
export const executeOutputSchema = z.object(executeOutputShape);
export const listAllowedOutputSchema = z.object(listAllowedOutputShape);

export type ExecuteInput = z.infer<typeof executeInputSchema>;
export type ExecuteOutput = z.infer<typeof executeOutputSchema>;
export type ListAllowedOutput = z.infer<typeof listAllowedOutputSchema>;
export type Risk = z.infer<typeof riskSchema>;
