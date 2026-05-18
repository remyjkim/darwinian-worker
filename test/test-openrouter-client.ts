import { OpenRouterMastraTextClient } from "../cli/commands/recommend/openrouter-client";
import { QUERY_GENERATOR_SYSTEM_PROMPT } from "../cli/commands/recommend/prompts";

async function testOpenRouterClient() {
  console.log("Testing OpenRouter client with real API...\n");

  const client = new OpenRouterMastraTextClient();
  console.log("✓ Client initialized with OPENROUTER_API_KEY from .env\n");

  try {
    console.log("Generating queries for: 'frontend testing'...\n");
    const response = await client.generateText({
      system: QUERY_GENERATOR_SYSTEM_PROMPT,
      prompt: "User query: frontend testing",
      model: "openai/gpt-3.5-turbo",
      temperature: 0.2,
      timeoutMs: 5000,
    });

    console.log("Response received:");
    console.log(response);
    console.log("\n✓ OpenRouter client working correctly!");
  } catch (error) {
    console.error("✗ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testOpenRouterClient();
