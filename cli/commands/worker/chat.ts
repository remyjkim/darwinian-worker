// ABOUTME: Implements drwn worker chat against the metered Deploy API chat endpoint.
// ABOUTME: Sends a single message to an active worker and prints the API response as JSON.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveWorkerConfig } from "../../core/worker-config";
import { describeWorkerError } from "../../core/worker-error";
import { fetchJsonWithWorkerAuth } from "../../core/worker-http";
import { renderJson } from "../../core/output";

function renderError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  if (typeof body === "string" && body.trim()) return body;
  return "unknown error";
}

export class WorkerChatCommand extends BaseCommand {
  static override paths = [["worker", "chat"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Send a single message to a deployed worker.",
    details: `
      Calls the metered Deploy API chat endpoint for an active worker and prints
      the response as JSON. Use this for smoke tests and scripted invocations;
      interactive chat clients should call the same API endpoint directly.
    `,
    examples: [
      ["Chat with a worker", "drwn worker chat harari --message \"hello\""],
    ],
  });

  slug = Option.String();

  message = Option.String("--message", {
    required: true,
    description: "Message text to send to the worker.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveWorkerConfig();
    try {
      const { response, body } = await fetchJsonWithWorkerAuth<unknown>(
        this.context,
        `${apiBaseUrl}/api/minds/${this.slug}/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: this.message }),
        },
      );
      if (!response.ok) {
        this.context.stderr.write(`Chat failed (${response.status}): ${renderError(body)}\n`);
        return 1;
      }
      this.context.stdout.write(renderJson(body));
      return 0;
    } catch (error) {
      this.context.stderr.write(`${describeWorkerError(error, apiBaseUrl)}\n`);
      return 1;
    }
  }
}
