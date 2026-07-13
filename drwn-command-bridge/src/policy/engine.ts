// ABOUTME: Implements pure default-deny policy decisions for parsed command requests.
// ABOUTME: Evaluates deny rules before allow rules without touching filesystem or processes.

import { basename } from "node:path";
import { isAboveConsentThreshold } from "./classify";
import type { BridgePolicy, AllowRule } from "./load";
import type { Risk } from "../schema";

export interface PolicyRequest {
  rawCommand: string;
  argv: string[];
  cwd: string;
  shell: boolean;
  envKeys: string[];
}

export type Decision =
  | { kind: "deny"; reason: string; matchedRule: string }
  | { kind: "auto"; risk: Risk; matchedRule: string; resolvedArgv: string[] }
  | { kind: "consent"; risk: Risk; matchedRule: string; resolvedArgv: string[] };

const elevationPrograms = new Set(["sudo", "doas", "runas", "pkexec"]);

function normalizeCommand(value: string) {
  return value.normalize("NFKC").replace(/\p{White_Space}+/gu, " ").trim();
}

function commandBasename(program: string) {
  return basename(program.replace(/\\/g, "/")).toLowerCase();
}

function hasPathSeparator(program: string) {
  return program.includes("/") || program.includes("\\");
}

function deny(reason: string, matchedRule: string): Decision {
  return { kind: "deny", reason, matchedRule };
}

function allowDecision(rule: AllowRule, matchedRule: string, argv: string[], policy: BridgePolicy): Decision {
  if (isAboveConsentThreshold(rule.risk, policy.consentRequiredAbove)) {
    return { kind: "consent", risk: rule.risk, matchedRule, resolvedArgv: argv };
  }
  return { kind: "auto", risk: rule.risk, matchedRule, resolvedArgv: argv };
}

function matchesProgram(rule: AllowRule, program: string) {
  if (rule.programPath) {
    return program === rule.programPath;
  }
  return rule.program === program;
}

export function decide(req: PolicyRequest, policy: BridgePolicy): Decision {
  const [program, ...args] = req.argv;
  if (!program) {
    return deny("missing command program", "schema");
  }

  const normalized = normalizeCommand(req.rawCommand);
  const base = commandBasename(program);
  if (elevationPrograms.has(base)) {
    return deny("elevation programs are not allowlistable", "deny_always");
  }

  for (const rule of policy.denyAlways) {
    if (rule.regex.test(normalized)) {
      return deny(`command matched deny rule ${rule.pattern}`, "deny_always");
    }
  }

  if (req.shell) {
    const shellRule = policy.allow.find((rule) => rule.shell === true && matchesProgram(rule, program));
    if (!shellRule) {
      return deny("shell mode requires an explicit shell allow rule", "shell");
    }
    return { kind: "consent", risk: shellRule.risk, matchedRule: `allow.${shellRule.program ?? shellRule.programPath}`, resolvedArgv: req.argv };
  }

  if (hasPathSeparator(program)) {
    const pathRule = policy.allow.find((rule) => rule.programPath === program);
    if (!pathRule) {
      return deny("program paths require an explicit program_path allow rule", "program_path");
    }
    return allowDecision(pathRule, `allow.${pathRule.programPath}`, req.argv, policy);
  }

  for (const rule of policy.allow) {
    if (rule.pattern) {
      const regex = new RegExp(rule.pattern, "u");
      if (!regex.test(normalized)) {
        continue;
      }
    } else if (!rule.program || !matchesProgram(rule, program)) {
      continue;
    }

    if (rule.argsAllow && !rule.argsAllow.includes(args[0] ?? "")) {
      return deny(`argument "${args[0] ?? ""}" is not allowed for ${program}`, `allow.${program}.args_allow`);
    }
    return allowDecision(rule, `allow.${rule.program ?? rule.pattern ?? "rule"}`, req.argv, policy);
  }

  return deny(`command "${program}" is not on the allowlist`, "default");
}
