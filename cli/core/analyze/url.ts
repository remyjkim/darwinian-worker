// ABOUTME: Composes analyzer frontend URLs from configured web base URL and backend IDs.
// ABOUTME: Keeps URL formatting centralized for human and JSON command output.

export function processingUrl(webBaseUrl: string, jobId: string): string {
  return new URL(`/processing/${encodeURIComponent(jobId)}`, webBaseUrl).toString();
}

export function reportUrl(webBaseUrl: string, reportId: string): string {
  return new URL(`/report/${encodeURIComponent(reportId)}`, webBaseUrl).toString();
}
