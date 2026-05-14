// ABOUTME: Provides a real OpenRouter-backed implementation of the MastraTextClient contract.
// ABOUTME: Lets the query generator call an OpenAI-compatible model without leaking API keys.

import type { MastraTextClient } from "./types";

export interface OpenRouterMastraTextClientOptions {
  apiKey?: string;
  baseUrl?: string;
  appTitle?: string;
  referer?: string;
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OpenRouterMastraTextClient implements MastraTextClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appTitle: string;
  private readonly referer?: string;

  constructor(options: OpenRouterMastraTextClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required to call the real query generator.");
    }

    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1";
    this.appTitle = options.appTitle ?? "beginning-harness skill recommendation";
    this.referer = options.referer;
  }

  async generateText(input: {
    system: string;
    prompt: string;
    model: string;
    temperature: number;
    timeoutMs: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": this.appTitle,
          ...(this.referer ? { "HTTP-Referer": this.referer } : {}),
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
        }),
      });

      const body = (await response.json().catch(() => ({}))) as OpenRouterChatResponse;
      if (!response.ok) {
        throw new Error(body.error?.message ?? `OpenRouter request failed with HTTP ${response.status}`);
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenRouter response did not include message content.");
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}
