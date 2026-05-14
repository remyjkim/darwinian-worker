// ABOUTME: Provides lightweight buffered logging for skill recommendation evaluation.
// ABOUTME: Supports debug/info/error instrumentation and optional JSONL output.

import type { LogLevel, SkillRecommendationLogger } from "./types";

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export interface BufferedSkillRecommendationLogger extends SkillRecommendationLogger {
  entries: LogEntry[];
  flush(): Promise<void>;
}

export function createBufferedLogger(outputFile?: string): BufferedSkillRecommendationLogger {
  const entries: LogEntry[] = [];
  const append = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    entries.push({ level, message, context, timestamp: new Date().toISOString() });
  };

  return {
    entries,
    debug(message, context) {
      append("debug", message, context);
    },
    info(message, context) {
      append("info", message, context);
    },
    error(message, context) {
      append("error", message, context);
    },
    async flush() {
      if (!outputFile) {
        return;
      }
      await Bun.write(outputFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    },
  };
}
