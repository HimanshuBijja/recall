import { generatorParameters, type FSRSParameters } from "ts-fsrs";
import { readDb, writeDb } from "@/lib/db";
import type { FsrsSettings } from "@/types";

export const DEFAULT_FSRS_SETTINGS: FsrsSettings = {
  request_retention: 0.9,
  maximum_interval: 36500,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
  enable_fuzz: false,
  enable_short_term: true,
};

const STEP_RE = /^\d+(?:\.\d+)?[smhd]$/;

export function parseSteps(text: string): string[] {
  const tokens = text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  for (const t of tokens) {
    if (!STEP_RE.test(t)) {
      throw new Error(`Invalid step "${t}" — use forms like 1m, 10m, 1h, 1d`);
    }
  }
  return tokens;
}

export function formatSteps(steps: string[]): string {
  return steps.join(", ");
}

export function toGeneratorParameters(s: FsrsSettings): FSRSParameters {
  return generatorParameters({
    request_retention: s.request_retention,
    maximum_interval: s.maximum_interval,
    learning_steps: s.learning_steps as FSRSParameters["learning_steps"],
    relearning_steps: s.relearning_steps as FSRSParameters["relearning_steps"],
    enable_fuzz: s.enable_fuzz,
    enable_short_term: s.enable_short_term,
  });
}

export function validateSettings(s: FsrsSettings): string | null {
  if (typeof s.request_retention !== "number" || s.request_retention < 0.7 || s.request_retention > 0.97) {
    return "request_retention must be between 0.70 and 0.97";
  }
  if (typeof s.maximum_interval !== "number" || s.maximum_interval < 1) {
    return "maximum_interval must be at least 1 day";
  }
  try {
    parseSteps(formatSteps(s.learning_steps));
    parseSteps(formatSteps(s.relearning_steps));
  } catch (e) {
    return e instanceof Error ? e.message : "invalid steps";
  }
  if (s.learning_steps.length === 0) return "learning_steps cannot be empty";
  return null;
}

export async function readSettings(): Promise<FsrsSettings> {
  const rows = await readDb<FsrsSettings>("settings.json");
  return { ...DEFAULT_FSRS_SETTINGS, ...(rows[0] ?? {}) };
}

export async function writeSettings(s: FsrsSettings): Promise<void> {
  await writeDb("settings.json", [s]);
}
