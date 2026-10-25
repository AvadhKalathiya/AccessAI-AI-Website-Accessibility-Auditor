/**
 * SQLite Database Connection & Client Provider
 *
 * Provides a lazy, server-only SQLite connection using better-sqlite3 and Drizzle ORM.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Database file is strictly stored in local 'data/' directory outside public/ routes.
 * 2. WAL (Write-Ahead Logging) mode and busy timeouts are enabled for concurrency.
 * 3. Foreign key constraints are explicitly enforced (PRAGMA foreign_keys = ON).
 * 4. Lazy initialization prevents database access during Next.js static page generation.
 * 5. Reusable across Next.js development hot-reloads via global singleton.
 */

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

// Global singleton to survive Next.js dev reloads
declare global {
  var __accessai_db__: AppDatabase | undefined;
  var __accessai_sqlite__: Database.Database | undefined;
}

/**
 * Resolves the SQLite database file path safely.
 */
export function resolveDatabasePath(): string {
  const envUrl = process.env.DATABASE_URL;

  if (envUrl && envUrl.startsWith("file:")) {
    const rawPath = envUrl.replace(/^file:/, "");
    if (path.isAbsolute(rawPath)) {
      return rawPath;
    }
    return path.resolve(process.cwd(), rawPath);
  }

  // Default path in workspace data directory
  return path.resolve(process.cwd(), "data", "accessai.db");
}

/**
 * Creates and configures a fresh better-sqlite3 database instance.
 * Useful for tests that require isolated in-memory or temporary files.
 */
export function createSqliteConnection(dbPath: string): {
  sqlite: Database.Database;
  db: AppDatabase;
} {
  // Ensure parent directory exists for file-backed databases
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath, {
    timeout: 5000, // 5 second busy timeout
  });

  // Enable WAL mode and foreign key constraints
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });

  return { sqlite, db };
}

/**
 * Retrieves the application's lazy database client singleton.
 */
export function getDb(): AppDatabase {
  if (process.env.NODE_ENV === "production") {
    if (!global.__accessai_db__) {
      const dbPath = resolveDatabasePath();
      const { db, sqlite } = createSqliteConnection(dbPath);
      global.__accessai_db__ = db;
      global.__accessai_sqlite__ = sqlite;
    }
    return global.__accessai_db__;
  }

  // Development environment: reuse global to avoid file lock issues on HMR
  if (!global.__accessai_db__) {
    const dbPath = resolveDatabasePath();
    const { db, sqlite } = createSqliteConnection(dbPath);
    global.__accessai_db__ = db;
    global.__accessai_sqlite__ = sqlite;
  }

  return global.__accessai_db__;
}

/**
 * Closes the active database connection if open.
 */
export function closeDb(): void {
  if (global.__accessai_sqlite__) {
    try {
      global.__accessai_sqlite__.close();
    } catch {
      // Ignore close errors during process teardown
    }
    global.__accessai_sqlite__ = undefined;
    global.__accessai_db__ = undefined;
  }
}
