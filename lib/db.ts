import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureFile(filename: string) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const full = path.join(DATA_DIR, filename);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, "[]", "utf8");
  }
  return full;
}

export function readDb<T>(filename: string): T[] {
  const full = ensureFile(filename);
  const raw = fs.readFileSync(full, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeDb<T>(filename: string, data: T[]): void {
  const full = ensureFile(filename);
  fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
}
