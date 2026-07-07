// ABOUTME: Recursive filesystem watcher with platform fallback for linked card sources.
// ABOUTME: Shared by write --watch and drwn dev watch loops.

import { existsSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

export interface RecursiveWatcher {
  close: () => void;
}

export function normalizeWatchPath(path: string) {
  return path.replace(/^file:/, "");
}

export function createRecursiveWatcher(root: string, onEvent: (eventPath: string) => void): RecursiveWatcher {
  const normalizedRoot = normalizeWatchPath(root);
  const watchers: FSWatcher[] = [];
  const watchedDirs = new Set<string>();

  const watchDirectory = (dir: string, recursive: boolean) => {
    if (watchedDirs.has(dir)) {
      return;
    }
    watchedDirs.add(dir);
    const watcher = watch(
      dir,
      { persistent: true, recursive },
      (_event, filename) => {
        const eventPath = filename ? join(dir, filename.toString()) : dir;
        onEvent(eventPath);
        if (!recursive && filename) {
          const child = join(dir, filename.toString());
          try {
            if (statSync(child).isDirectory()) {
              watchDirectory(child, false);
            }
          } catch {
            // ignore races on deleted paths
          }
        }
      },
    );
    watchers.push(watcher);
  };

  const crawlAndWatch = (dir: string) => {
    watchDirectory(dir, false);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      crawlAndWatch(join(dir, entry.name));
    }
  };

  if (!existsSync(normalizedRoot)) {
    return { close: () => {} };
  }

  const stats = statSync(normalizedRoot);
  if (!stats.isDirectory()) {
    const watcher = watch(normalizedRoot, { persistent: true }, () => onEvent(normalizedRoot));
    watchers.push(watcher);
    return {
      close: () => {
        for (const watcher of watchers) {
          watcher.close();
        }
      },
    };
  }

  try {
    watchDirectory(normalizedRoot, true);
  } catch {
    crawlAndWatch(normalizedRoot);
  }

  return {
    close: () => {
      for (const watcher of watchers) {
        watcher.close();
      }
      watchedDirs.clear();
    },
  };
}
