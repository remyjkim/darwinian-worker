import { recommendSkillsWithOpenRouter, createBufferedLogger } from "../src/skill-recommendation";
import { createInterface } from "readline";
import { spawn } from "child_process";

const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function printSpinner(message: string, frame: number) {
  process.stdout.write(`\r${spinner[frame % spinner.length]} ${message}`);
}

async function searchSkills(query: string) {
  let frame = 0;
  const spinnerInterval = setInterval(() => {
    printSpinner(`Searching skills for: "${query}"`, frame++);
  }, 100);

  try {
    const logger = createBufferedLogger("./skill-recommendations.jsonl");
    const result = await recommendSkillsWithOpenRouter(query, { logger });

    clearInterval(spinnerInterval);
    process.stdout.write("\r");

    console.log(`\n✨ Top 5 Results:\n`);
    const top5 = result.aggregatedSkills.slice(0, 5);
    
    if (top5.length > 0) {
      top5.forEach((skill, i) => {
        const installs = (skill.metadata?.installs as number) || 0;
        const installStr = formatInstalls(installs, true);
        console.log(`   ${i + 1}. ${skill.name.padEnd(25)} ${installStr}`);
      });
    } else {
      console.log("   (No skills found)\n");
    }

    console.log(`\n⏱️  Latency: ${(result.latencyMs / 1000).toFixed(1)}s\n`);

    return top5;
  } catch (error) {
    clearInterval(spinnerInterval);
    process.stdout.write("\r");
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function formatInstalls(count: number, colored = false): string {
  const str = count >= 1000000
    ? (count / 1000000).toFixed(1) + "M"
    : count >= 1000
    ? (count / 1000).toFixed(1) + "K"
    : count.toString();

  if (colored) {
    return `\x1b[36m${str} installs\x1b[0m`;
  }
  return str;
}

async function selectWithArrows<T>(items: T[], display: (item: T) => string): Promise<T | null> {
  if (items.length === 0) return null;

  let selected = 0;
  let buffer = "";
  let firstDraw = true;

  const draw = () => {
    if (firstDraw) {
      process.stdout.write("Use ↑↓ arrows and press Enter:\n\n");
      items.forEach((item, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`${mark}${color}${i + 1}. ${display(item)}${reset}\n`);
      });
      firstDraw = false;
    } else {
      // Move up to redraw items (skip the header line)
      for (let i = 0; i < items.length; i++) {
        process.stdout.write("\x1b[A");
      }
      items.forEach((item, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`\x1b[K${mark}${color}${i + 1}. ${display(item)}${reset}\n`);
      });
    }
  };

  return new Promise((resolve) => {
    draw();
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      buffer += chunk;

      if (buffer === "\x1b[A") {
        // Up arrow
        selected = (selected - 1 + items.length) % items.length;
        draw();
        buffer = "";
      } else if (buffer === "\x1b[B") {
        // Down arrow
        selected = (selected + 1) % items.length;
        draw();
        buffer = "";
      } else if (buffer === "\r" || buffer === "\n") {
        // Enter
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        const item = items[selected];
        if (item !== undefined) {
          process.stdout.write(`\n✅ Selected: ${display(item)}\n\n`);
          resolve(item);
        }
        buffer = "";
      } else if (buffer === "\x03") {
        // Ctrl+C
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.exit(0);
      }

      if (buffer.length > 3) buffer = "";
    };

    process.stdin.on("data", onData);
  });
}

async function selectMenu(): Promise<number> {
  let selected = 0;
  let buffer = "";
  let firstDraw = true;
  const options = ["Add skill", "Refine search", "Exit"];

  const draw = () => {
    const menuLines = [
      "What would you like to do?",
      "",
      "Use ↑↓ arrows and press Enter:",
      "",
    ];

    if (firstDraw) {
      process.stdout.write(menuLines.join("\n") + "\n\n");
      options.forEach((option, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`${mark}${color}${i + 1}. ${option}${reset}\n`);
      });
      firstDraw = false;
    } else {
      // Move up 3 lines (the options) and redraw them
      for (let i = 0; i < 3; i++) {
        process.stdout.write("\x1b[A");
      }
      options.forEach((option, i) => {
        const mark = i === selected ? "▶️ " : "  ";
        const color = i === selected ? "\x1b[1;32m" : "";
        const reset = i === selected ? "\x1b[0m" : "";
        process.stdout.write(`\x1b[K${mark}${color}${i + 1}. ${option}${reset}\n`);
      });
    }
  };

  return new Promise((resolve) => {
    draw();
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      buffer += chunk;

      if (buffer === "\x1b[A") {
        // Up arrow
        selected = (selected - 1 + options.length) % options.length;
        draw();
        buffer = "";
      } else if (buffer === "\x1b[B") {
        // Down arrow
        selected = (selected + 1) % options.length;
        draw();
        buffer = "";
      } else if (buffer === "\r" || buffer === "\n") {
        // Enter
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        resolve(selected);
        buffer = "";
      } else if (buffer === "\x03") {
        // Ctrl+C
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.exit(0);
      }

      if (buffer.length > 3) buffer = "";
    };

    process.stdin.on("data", onData);
  });
}

function promptText(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Handle "add skill" command
  if (args[0] === "add" && args[1] === "skill") {
    const skillId = args.slice(2).join(" ");
    if (!skillId) {
      console.error("Usage: bun run cli/index.ts add skill <skill-id>");
      process.exit(1);
    }

    console.log(`\n⏳ Adding skill: ${skillId}...\n`);
    await runCommand("npx", ["skills", "add", skillId]);
    console.log(`✅ Skill added successfully!\n`);
    process.exit(0);
  }

  // Handle "recommend skill" command
  if (args[0] !== "recommend" || args[1] !== "skill") {
    console.error("Usage:");
    console.error("  bun run cli/index.ts recommend skill <query>");
    console.error("  bun run cli/index.ts add skill <skill-id>\n");
    process.exit(1);
  }

  let query = args.slice(2).join(" ");
  if (!query) {
    console.error("Error: query cannot be empty");
    process.exit(1);
  }

  console.log("");

  while (true) {
    const skills = await searchSkills(query);

    if (!skills) {
      process.exit(1);
    }

    if (skills.length === 0) {
      console.log("No skills found. Try a different search.\n");
      continue;
    }

    const choice = await selectMenu();

    switch (choice) {
      case 0:
        // Add skill
        const selected = await selectWithArrows(
          skills,
          (skill) => `${skill.name} (${formatInstalls((skill.metadata?.installs as number) || 0)})`
        );

        if (selected) {
          console.log(`⏳ Adding skill...\n`);
          try {
            await runCommand("npx", ["skills", "add", selected.id]);
            console.log(`✅ Skill added successfully!\n`);
          } catch (error) {
            console.log(`📝 To add manually, run:\n`);
            console.log(`   npx skills add ${selected.id}\n`);
          }
        }
        process.exit(0);
        break;

      case 1:
        // Refine search
        const newQuery = await promptText("Enter new search query: ");
        if (newQuery) {
          query = newQuery;
          console.log("");
        } else {
          console.log("Query cannot be empty.\n");
        }
        break;

      case 2:
        process.exit(0);
    }
  }
}

main();
