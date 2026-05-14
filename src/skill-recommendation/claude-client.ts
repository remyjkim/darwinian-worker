import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
}

export class ClaudeApiClient {
  private client: Anthropic;
  private model: string;

  constructor(options: ClaudeClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Claude skill summaries");
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? "claude-haiku-4-5-20251001";
  }

  async generateSummary(skillName: string, skillId: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: `Generate a concise 3-sentence summary of what the "${skillName}" (ID: ${skillId}) package/skill does. Return only the 3 sentences, no additional text.`,
          },
        ],
      });

      const content = message.content[0];
      if (content && content.type === "text") {
          return content.text.trim();
      }
      return `${skillName} is a useful package for development.`;
    } catch (error) {
      process.stderr.write(
        `Failed to generate summary for ${skillName}: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return `${skillName} is a useful package for development.`;
    }
  }
}
