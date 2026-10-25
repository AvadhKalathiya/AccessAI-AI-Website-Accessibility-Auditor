import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { ScanRepository } from "@/lib/db/scan-repository";
import type { ScanResult } from "@/lib/scanner/types";

describe("SQLite + Drizzle Scan Repository Integration Suite", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let repository: ScanRepository;

  beforeEach(() => {
    // Isolated in-memory database with foreign keys and WAL mode
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Run actual Drizzle migrations against in-memory DB
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

    repository = new ScanRepository(db as any);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("applies migrations cleanly and creates empty tables", async () => {
    const list = await repository.listScans();
    expect(list.total).toBe(0);
    expect(list.items).toEqual([]);
  });

  it("creates a queued scan record and retrieves it by ID", async () => {
    const created = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe("queued");

    const scan = await repository.getScanById(created.id);
    expect(scan).toBeDefined();
    expect(scan?.submittedUrl).toBe("https://example.com");
    expect(scan?.progressStage).toBe("queued");
  });

  it("updates progress stages sequentially", async () => {
    const created = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });

    await repository.updateProgress(created.id, "navigating", "navigating", "Navigating to URL...");
    let scan = await repository.getScanById(created.id);
    expect(scan?.status).toBe("navigating");
    expect(scan?.statusMessage).toBe("Navigating to URL...");

    await repository.updateProgress(created.id, "auditing", "auditing", "Running axe-core...");
    scan = await repository.getScanById(created.id);
    expect(scan?.status).toBe("auditing");
    expect(scan?.statusMessage).toBe("Running axe-core...");
  });

  it("atomically persists scan completion, violations, affected nodes, and metrics", async () => {
    const created = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });

    const mockResult: ScanResult = {
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      status: "completed",
      success: true,
      automatedScore: 85,
      severityCounts: {
        critical: 1,
        serious: 0,
        moderate: 0,
        minor: 0,
        unknown: 0,
        totalRules: 1,
        totalAffectedElements: 2,
      },
      ruleCounts: {
        passed: 12,
        incomplete: 1,
        inapplicable: 5,
        violations: 1,
      },
      violations: [
        {
          ruleId: "image-alt",
          impact: "critical",
          description: "Images must have alt attribute",
          helpText: "Add alt text to images",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
          tags: ["wcag2a", "wcag111"],
          wcagTags: ["wcag111"],
          affectedCount: 2,
          nodes: [
            {
              target: ["img#logo"],
              htmlSnippet: "<img id='logo' src='logo.png'>",
              failureSummary: "Missing alt attribute",
            },
            {
              target: ["img.banner"],
              htmlSnippet: "<img class='banner' src='banner.png'>",
              failureSummary: "Missing alt attribute",
            },
          ],
        },
      ],
      incomplete: [],
      passedRuleIds: ["aria-roles"],
      inapplicableRuleIds: ["video-caption"],
      timing: {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1450,
      },
      warnings: ["Test warning note"],
      metadata: {
        axeVersion: "4.10.3",
        playwrightVersion: "1.50.0",
        browser: "Chromium (Headless)",
        wcagStandardScope: ["wcag2a"],
      },
    };

    await repository.completeScan(created.id, mockResult);

    const report = await repository.getFullScanReport(created.id);
    expect(report).toBeDefined();
    expect(report?.status).toBe("completed");
    expect(report?.metrics?.automatedScore).toBe(85);
    expect(report?.metrics?.criticalRules).toBe(1);
    expect(report?.metrics?.totalAffectedElements).toBe(2);

    expect(report?.violations.length).toBe(1);
    expect(report?.violations[0].ruleId).toBe("image-alt");
    expect(report?.violations[0].nodes.length).toBe(2);
    expect(report?.violations[0].nodes[0].targetSelectors).toEqual(["img#logo"]);
  });

  it("records scan failures accurately", async () => {
    const created = await repository.createQueuedScan({
      submittedUrl: "https://broken-site.com",
      normalizedUrl: "https://broken-site.com/",
    });

    await repository.recordFailure(created.id, {
      code: "TARGET_UNAVAILABLE",
      clientMessage: "Site unreachable.",
      technicalDetails: "ERR_CONNECTION_REFUSED",
    });

    const scan = await repository.getScanById(created.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.errorCode).toBe("TARGET_UNAVAILABLE");
    expect(scan?.errorMessage).toBe("Site unreachable.");
    expect(scan?.errorDetails).toBe("ERR_CONNECTION_REFUSED");
  });

  it("recovers interrupted jobs on process restart", async () => {
    const scan1 = await repository.createQueuedScan({
      submittedUrl: "https://example1.com",
      normalizedUrl: "https://example1.com/",
    });
    await repository.updateProgress(scan1.id, "navigating", "navigating", "Navigating...");

    const scan2 = await repository.createQueuedScan({
      submittedUrl: "https://example2.com",
      normalizedUrl: "https://example2.com/",
    });

    const recoveredCount = await repository.recoverInterruptedJobs();
    expect(recoveredCount).toBe(2);

    const check1 = await repository.getScanById(scan1.id);
    expect(check1?.status).toBe("failed");
    expect(check1?.statusMessage).toContain("interrupted");
  });

  it("paginates scan lists cleanly with limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await repository.createQueuedScan({
        submittedUrl: `https://example${i}.com`,
        normalizedUrl: `https://example${i}.com/`,
      });
    }

    const page1 = await repository.listScans({ limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.items.length).toBe(2);

    const page2 = await repository.listScans({ limit: 2, offset: 2 });
    expect(page2.total).toBe(5);
    expect(page2.items.length).toBe(2);
  });
});
