// ABOUTME: Enforces secret-reference-only persistence for reusable MCP definitions.
// ABOUTME: Replaces known credential values and rejects unresolved sensitive literals.

import type { RegistryServer } from "./types";

const SENSITIVE_NAME = /(auth|credential|key|password|secret|token)/i;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_REFERENCE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

function sensitiveEnvironmentValues() {
  return Object.entries(process.env)
    .filter(([name, value]) => SENSITIVE_NAME.test(name) && Boolean(value))
    .sort((left, right) => (right[1]?.length ?? 0) - (left[1]?.length ?? 0));
}

function replaceKnownSecretValues(value: string) {
  let sanitized = value;
  for (const [name, secret] of sensitiveEnvironmentValues()) {
    sanitized = sanitized.replaceAll(secret!, `\${${name}}`);
  }
  return sanitized;
}

function sanitizeSensitiveValue(value: string, field: string) {
  if (ENV_REFERENCE.test(value)) return value;
  if (ENV_NAME.test(value) && process.env[value] !== undefined) return `\${${value}}`;
  const sanitized = replaceKnownSecretValues(value);
  if (sanitized !== value || sanitized.includes("${")) return sanitized;
  throw new Error(`MCP_SECRET_LITERAL: ${field} must reference an environment variable`);
}

export function sanitizeMcpServerSecrets(name: string, server: RegistryServer): RegistryServer {
  const next: RegistryServer = structuredClone(server);
  next.args = next.args?.map((value, index, args) => {
    const previous = args[index - 1] ?? "";
    return SENSITIVE_NAME.test(previous)
      ? sanitizeSensitiveValue(value, `MCP ${name} args[${index}]`)
      : replaceKnownSecretValues(value);
  });
  next.env = next.env
    ? Object.fromEntries(Object.entries(next.env).map(([key, value]) => [
        key,
        SENSITIVE_NAME.test(key)
          ? sanitizeSensitiveValue(value, `MCP ${name} env.${key}`)
          : replaceKnownSecretValues(value),
      ]))
    : undefined;
  next.headers = next.headers
    ? Object.fromEntries(Object.entries(next.headers).map(([key, value]) => [
        key,
        SENSITIVE_NAME.test(key)
          ? sanitizeSensitiveValue(value, `MCP ${name} headers.${key}`)
          : replaceKnownSecretValues(value),
      ]))
    : undefined;
  if (next.url) next.url = replaceKnownSecretValues(next.url);
  return next;
}
