/**
 * Database Migration Script
 *
 * Programmatically applies Drizzle SQL migrations to the target SQLite database.
 */

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { getDb, resolveDatabasePath } from "./index";

export function runMigrations(customDb?: ReturnType<typeof getDb>): void {
  const db = customDb || getDb();
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");

  migrate(db, { migrationsFolder });
}

// When executed directly via `tsx src/lib/db/migrate.ts`
if (require.main === module || process.argv[1]?.endsWith("migrate.ts")) {
  console.log(`Running migrations against ${resolveDatabasePath()}...`);
  try {
    runMigrations();
    console.log("Migrations successfully applied! 🚀");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}
