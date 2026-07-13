// ABOUTME: Loads and validates default-deny drwn-command-bridge policy YAML.
// ABOUTME: Normalizes operator-facing snake_case fields into typed runtime policy.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { riskSchema, type Risk } from "../schema";

const pathArgsSchema = z
  .object({
    all_slashy: z.boolean().optional(),
  })
  .optional();

const allowRuleSchema = z
  .object({
    program: z.string().min(1).optional(),
    program_path: z.string().min(1).optional(),
    args_allow: z.array(z.string()).optional(),
    pattern: z.string().min(1).optional(),
    risk: riskSchema,
    path_args: pathArgsSchema,
    allow_url_args: z.boolean().optional(),
    shell: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.program || value.program_path || value.pattern), {
    message: "allow rule requires program, program_path, or pattern",
  });

const denyRuleSchema = z.object({
  pattern: z.string().min(1),
});

const policySchema = z.object({
  version: z.literal(1),
  default: z.literal("deny"),
  allow: z.array(allowRuleSchema).min(1),
  deny_always: z.array(denyRuleSchema).optional(),
  consent_required_above: riskSchema.optional(),
  consent_cache_ttl_ms: z.number().int().min(0).max(300000).optional(),
  env_allow: z.array(z.string()).optional(),
  roots_allow: z.array(z.string().min(1)).min(1),
  sandbox: z
    .object({
      required: z.boolean().optional(),
    })
    .optional(),
});

export interface PathArgsPolicy {
  allSlashy: boolean;
}

export interface AllowRule {
  program?: string;
  programPath?: string;
  argsAllow?: string[];
  pattern?: string;
  risk: Risk;
  pathArgs: PathArgsPolicy;
  allowUrlArgs: boolean;
  shell: boolean;
}

export interface DenyRule {
  pattern: string;
  regex: RegExp;
}

export interface BridgePolicy {
  version: 1;
  default: "deny";
  allow: AllowRule[];
  denyAlways: DenyRule[];
  consentRequiredAbove: Risk;
  consentCacheTtlMs: number;
  envAllow: string[];
  rootsAllow: string[];
  sandbox: { required: boolean };
}

export interface PolicyParseOptions {
  homeDir?: string;
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

function expandRootPath(path: string, homeDir: string) {
  if (path === "~") {
    return homeDir;
  }
  if (path.startsWith("~/")) {
    return resolve(homeDir, path.slice(2));
  }
  return resolve(path);
}

function compileDenyRules(rules: Array<{ pattern: string }> = []): DenyRule[] {
  return rules.map((rule) => {
    try {
      return { pattern: rule.pattern, regex: new RegExp(rule.pattern, "u") };
    } catch (error) {
      throw new Error(`Invalid deny regex "${rule.pattern}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function parsePolicyText(text: string, options: PolicyParseOptions = {}): BridgePolicy {
  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(text);
  } catch (error) {
    throw new Error(`Invalid policy YAML: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = policySchema.safeParse(parsedYaml);
  if (!parsed.success) {
    throw new Error(`Invalid policy: ${formatZodError(parsed.error)}`);
  }

  const homeDir = options.homeDir ?? homedir();
  return {
    version: 1,
    default: "deny",
    allow: parsed.data.allow.map((rule) => ({
      ...(rule.program ? { program: rule.program } : {}),
      ...(rule.program_path ? { programPath: expandRootPath(rule.program_path, homeDir) } : {}),
      ...(rule.args_allow ? { argsAllow: rule.args_allow } : {}),
      ...(rule.pattern ? { pattern: rule.pattern } : {}),
      risk: rule.risk,
      pathArgs: { allSlashy: rule.path_args?.all_slashy ?? false },
      allowUrlArgs: rule.allow_url_args ?? false,
      shell: rule.shell ?? false,
    })),
    denyAlways: compileDenyRules(parsed.data.deny_always),
    consentRequiredAbove: parsed.data.consent_required_above ?? "low",
    consentCacheTtlMs: parsed.data.consent_cache_ttl_ms ?? 0,
    envAllow: parsed.data.env_allow ?? [],
    rootsAllow: parsed.data.roots_allow.map((entry) => expandRootPath(entry, homeDir)),
    sandbox: { required: parsed.data.sandbox?.required ?? true },
  };
}

export async function loadPolicyFile(path: string, options: PolicyParseOptions = {}) {
  return parsePolicyText(await readFile(path, "utf8"), options);
}
