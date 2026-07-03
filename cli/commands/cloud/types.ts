// ABOUTME: Deploy API DTOs and display helpers consumed by drwn cloud commands.
// ABOUTME: Mirrors the server response shape without importing worker runtime code.

export interface MindSummary {
  id: string;
  slug: string;
  created_at: string;
  active_deployment_id: string | null;
  model: string | null;
  status: string;
  card_ref: string | null;
  updated_at: string | null;
  serving: boolean;
}

export interface DeploymentRow {
  id: string;
  mind_id?: string;
  card_ref: string;
  model: string | null;
  status: string;
  content_hash: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeploymentsResponse {
  deployments: DeploymentRow[];
  active_deployment_id: string | null;
}

export function displayModel(model: string | null | undefined): string {
  return model ?? "default";
}

export function displayValue(value: string | null | undefined): string {
  return value ?? "-";
}
