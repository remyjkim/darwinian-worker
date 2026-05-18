import { detectInstalledTools } from "./cli/commands/recommend/extractors/skills-mcp-detector";

async function main() {
  const tools = await detectInstalledTools();

  console.log("\n📦 Installed Skills/Tools Summary:");
  console.log("================================\n");

  console.log(`✅ Total Installed: ${tools.all.length} items`);
  console.log(`   - Claude Skills: ${tools.skills.length}`);
  console.log(`   - MCP Servers: ${tools.mcpServers.length}`);

  console.log("\n📚 Installed Skills by Source:");
  console.log("------------------------------");

  console.log("\n🔵 Claude Code Skills (from ~/.claude/skills):");
  console.log(tools.skills.slice(0, 10).map((s) => `  • ${s}`).join("\n"));
  if (tools.skills.length > 10) {
    console.log(`  ... and ${tools.skills.length - 10} more`);
  }

  console.log("\n🔧 MCP Servers (from ~/.codex/config.toml):");
  if (tools.mcpServers.length > 0) {
    console.log(tools.mcpServers.map((s) => `  • ${s}`).join("\n"));
  } else {
    console.log("  (none found)");
  }

  console.log("\n\n🎯 Example: What skills should NOT be recommended?");
  console.log("--------------------------------------------------");
  const examples = tools.all.slice(0, 5);
  examples.forEach((skill) => {
    console.log(`  ❌ Should NOT recommend "${skill}" (already installed)`);
  });

  console.log("\n✨ These will be automatically filtered from recommendations.\n");
}

main().catch(console.error);
