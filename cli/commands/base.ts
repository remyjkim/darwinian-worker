// ABOUTME: Provides the typed Clipanion base command class for the drwn harness CLI.
// ABOUTME: Ensures commands share the same resolved AgentsContext shape.

import { Command } from "clipanion";
import type { AgentsContext } from "../context";

export abstract class BaseCommand extends Command<AgentsContext> {}
