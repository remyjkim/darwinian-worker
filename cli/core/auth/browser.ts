// ABOUTME: Opens authentication and analysis URLs in the user's default browser.
// ABOUTME: Uses Bun.spawn directly to avoid a runtime dependency for one best-effort action.

export function openBrowser(url: string): void {
  const cmd = process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];

  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // best-effort; the URL is always printed by the caller
  }
}
