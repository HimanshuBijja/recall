import { readDb, writeDb } from "@/lib/db";
import type { FsrsSettings } from "@/types";
import { DEFAULT_FSRS_SETTINGS } from "@/lib/fsrs-config";

// Server-only: DB-backed settings access. Pure helpers live in lib/fsrs-config
// (client-safe); re-exported here so server callers keep a single import site.
export {
  DEFAULT_FSRS_SETTINGS,
  parseSteps,
  formatSteps,
  toGeneratorParameters,
  validateSettings,
} from "@/lib/fsrs-config";

export async function readSettings(): Promise<FsrsSettings> {
  const rows = await readDb<FsrsSettings>("settings.json");
  return { ...DEFAULT_FSRS_SETTINGS, ...(rows[0] ?? {}) };
}

export async function writeSettings(s: FsrsSettings): Promise<void> {
  await writeDb("settings.json", [s]);
}
