/**
 * Vitest Global Setup & Teardown
 *
 * Directs all tests requiring database connectivity to an isolated test database
 * (`data/accessai-test.db`), ensuring tests never mutate or depend on the development
 * database (`data/accessai.db`).
 */

import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "@/lib/db/migrate";
import { closeDb } from "@/lib/db";

const testDbPath = path.resolve(process.cwd(), "data", "accessai-test.db");

export async function setup(): Promise<void> {
  process.env.DATABASE_URL = `file:${testDbPath}`;

  const dataDir = path.dirname(testDbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Pre-migrate isolated test database
  try {
    runMigrations();
  } catch (err) {
    console.error("[Test Setup] Failed to run test database migrations:", err);
  }
}

export async function teardown(): Promise<void> {
  closeDb();

  // Clean up test database files
  const filesToRemove = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
  ];

  for (const file of filesToRemove) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
