/**
 * Database Migration & Schema Verification Suite
 *
 * Verifies:
 * - Programmatic Drizzle migration execution on a clean temporary SQLite database
 * - Table creation for all core schema entities: scans, violations, affected_nodes, scan_metrics, remediations
 * - PRAGMA foreign_keys = ON enforcement and WAL mode activation
 * - Idempotency of migration runs (subsequent runs produce no errors)
 */

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { runMigrations } from "@/lib/db/migrate";
import * as schema from "@/lib/db/schema";

describe("Database Migration & Schema Verification Suite", () => {
  const tempDbPath = path.resolve(process.cwd(), "data", `test-migration-${Date.now()}.db`);
  let sqlite: Database.Database | undefined;

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
      sqlite = undefined;
    }
    // Clean up temporary database files
    const toRemove = [tempDbPath, `${tempDbPath}-wal`, `${tempDbPath}-shm`];
    for (const f of toRemove) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // Ignore
      }
    }
  });

  it("applies migrations cleanly to a new database and verifies all core tables exist", () => {
    // 1. Initialize fresh SQLite database
    sqlite = new Database(tempDbPath);
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    const db = drizzle(sqlite, { schema });

    // 2. Apply migrations
    expect(() => runMigrations(db as any)).not.toThrow();

    // 3. Inspect sqlite_master for table definitions
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all() as Array<{ name: string }>;

    const tableNames = new Set(tables.map((t) => t.name));

    expect(tableNames.has("scans")).toBe(true);
    expect(tableNames.has("violations")).toBe(true);
    expect(tableNames.has("affected_nodes")).toBe(true);
    expect(tableNames.has("scan_metrics")).toBe(true);
    expect(tableNames.has("remediations")).toBe(true);

    // 4. Verify PRAGMAs
    const fkResult = sqlite.pragma("foreign_keys", { simple: true });
    expect(fkResult).toBe(1);

    const journalMode = sqlite.pragma("journal_mode", { simple: true });
    expect(String(journalMode).toLowerCase()).toBe("wal");
  });

  it("is idempotent: running migrations multiple times succeeds without error", () => {
    sqlite = new Database(tempDbPath);
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });

    // Run 1
    runMigrations(db as any);

    // Run 2 (should be an idempotent no-op)
    expect(() => runMigrations(db as any)).not.toThrow();

    const countResult = sqlite
      .prepare("SELECT count(*) as count FROM __drizzle_migrations")
      .get() as { count: number };

    expect(countResult.count).toBeGreaterThan(0);
  });
});
