// ABOUTME: Resolves Studio Deployment endpoints for drwn cloud commands.
// ABOUTME: Keeps one-release IMINDS env fallbacks while preferring DRWN names.

export type CloudConfig = {
  apiBaseUrl: string;
  gatewayBaseUrl: string;
};

export function resolveCloudConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): CloudConfig {
  return {
    apiBaseUrl:
      env.DRWN_STUDIO_API_URL ??
      env.IMINDS_API_URL ??
      "https://studio.darwiniantools.com",
    gatewayBaseUrl:
      env.DRWN_STUDIO_GATEWAY_URL ??
      env.IMINDS_GATEWAY_URL ??
      "https://minds.darwiniantools.com",
  };
}
