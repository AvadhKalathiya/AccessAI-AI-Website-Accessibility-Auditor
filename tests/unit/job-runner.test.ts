import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { ScanRepository } from "@/lib/db/scan-repository";
import { ScanJobRunner } from "@/lib/scanner/scan-job-runner";
import type { ScanResult } from "@/lib/scanner/types";

describe("Scan Job Runner & Dispatcher Suite", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let repository: ScanRepository;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    repository = new ScanRepository(db as any);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("enqueues jobs and enforces queue capacity", async () => {
    vi.spyOn(repository, "updateProgress").mockImplementation(async () => {});
    vi.spyOn(repository, "recordFailure").mockImplementation(async () => {});

    const runner = new ScanJobRunner({
      repository,
      maxQueueSize: 2,
    });

    const enqueued1 = await runner.enqueue("scan-1", "https://example1.com");
    const enqueued2 = await runner.enqueue("scan-2", "https://example2.com");
    expect(enqueued1).toBe(true);
    expect(enqueued2).toBe(true);

    // Duplicate enqueue should return false
    const duplicate = await runner.enqueue("scan-1", "https://example1.com");
    expect(duplicate).toBe(false);

    // Over-capacity enqueue should throw error
    await expect(runner.enqueue("scan-3", "https://example3.com")).rejects.toThrowError(/capacity exceeded/i);
  });

  it("reports accurate active and waiting queue counts", () => {
    const runner = new ScanJobRunner({
      repository,
      maxQueueSize: 5,
    });

    const stats = runner.getQueueStats();
    expect(stats.activeCount).toBe(0);
    expect(stats.waitingCount).toBe(0);
    expect(stats.maxQueueSize).toBe(5);
  });
});
