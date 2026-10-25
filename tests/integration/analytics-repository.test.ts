import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { ScanRepository } from "@/lib/db/scan-repository";
import type { ScanResult } from "@/lib/scanner/types";

describe("Analytics & Advanced Search Repository Integration Suite", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let repository: ScanRepository;

  const createMockResult = (score: number, critical: number, serious: number): ScanResult => ({
    requestedUrl: "https://example.com/page",
    finalUrl: "https://example.com/page",
    status: "completed",
    success: true,
    automatedScore: score,
    severityCounts: {
      critical,
      serious,
      moderate: 0,
      minor: 0,
      unknown: 0,
      totalRules: critical + serious,
      totalAffectedElements: critical + serious,
    },
    ruleCounts: { passed: 10, incomplete: 0, inapplicable: 5, violations: critical + serious },
    violations: [
      {
        ruleId: "image-alt",
        impact: "critical",
        description: "Missing alt attribute",
        helpText: "Provide alt text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        tags: ["wcag2a", "wcag111"],
        wcagTags: ["wcag111"],
        affectedCount: critical,
        nodes: [
          {
            target: ["img.logo"],
            htmlSnippet: "<img src='logo.png'>",
            failureSummary: "Missing alt",
          },
        ],
      },
    ],
    incomplete: [],
    passedRuleIds: ["aria-roles"],
    inapplicableRuleIds: ["video-caption"],
    timing: { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 2000 },
    warnings: [],
    metadata: { axeVersion: "4.10.3", playwrightVersion: "1.50.0", browser: "Chromium", wcagStandardScope: ["wcag2a"] },
  });

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

  it("handles empty database in getAnalyticsSummary without division by zero", async () => {
    const analytics = await repository.getAnalyticsSummary(30);

    expect(analytics.totalScans).toBe(0);
    expect(analytics.completedScans).toBe(0);
    expect(analytics.failedScans).toBe(0);
    expect(analytics.inProgressScans).toBe(0);
    expect(analytics.totalViolations).toBe(0);
    expect(analytics.averageViolationsPerCompletedScan).toBe(0);
    expect(analytics.averageAutomatedScore).toBe(0);
    expect(analytics.mostRecentScanDate).toBeNull();
    expect(analytics.topRules).toEqual([]);
    expect(analytics.topDomains).toEqual([]);
    expect(analytics.trends.length).toBeGreaterThan(0);
  });

  it("aggregates completed, failed, and in-progress scans accurately", async () => {
    // 1. Create a completed scan
    const s1 = await repository.createQueuedScan({
      submittedUrl: "https://example.com/a",
      normalizedUrl: "https://example.com/a",
    });
    await repository.completeScan(s1.id, createMockResult(80, 2, 1));

    // 2. Create another completed scan
    const s2 = await repository.createQueuedScan({
      submittedUrl: "https://portal.test/b",
      normalizedUrl: "https://portal.test/b",
    });
    await repository.completeScan(s2.id, createMockResult(90, 1, 0));

    // 3. Create a failed scan
    const s3 = await repository.createQueuedScan({
      submittedUrl: "https://failed.org",
      normalizedUrl: "https://failed.org/",
    });
    await repository.recordFailure(s3.id, {
      code: "DNS_FAILURE",
      clientMessage: "Domain unreachable",
    });

    // 4. Create an in-progress scan
    await repository.createQueuedScan({
      submittedUrl: "https://active.com",
      normalizedUrl: "https://active.com/",
    });

    const analytics = await repository.getAnalyticsSummary(30);

    expect(analytics.totalScans).toBe(4);
    expect(analytics.completedScans).toBe(2);
    expect(analytics.failedScans).toBe(1);
    expect(analytics.inProgressScans).toBe(1);

    // Violations: (2+1) + (1+0) = 4
    expect(analytics.totalViolations).toBe(4);
    expect(analytics.averageViolationsPerCompletedScan).toBe(2);
    // Average score: (80 + 90) / 2 = 85
    expect(analytics.averageAutomatedScore).toBe(85);

    expect(analytics.severityDistribution.critical).toBe(3);
    expect(analytics.severityDistribution.serious).toBe(1);

    expect(analytics.topRules.length).toBe(1);
    expect(analytics.topRules[0].ruleId).toBe("image-alt");

    expect(analytics.topDomains.length).toBeGreaterThanOrEqual(2);
  });

  it("filters listScans by search query substring", async () => {
    await repository.createQueuedScan({
      submittedUrl: "https://acme-corp.com/home",
      normalizedUrl: "https://acme-corp.com/home",
    });
    await repository.createQueuedScan({
      submittedUrl: "https://beta-tech.io/about",
      normalizedUrl: "https://beta-tech.io/about",
    });

    const acmeResults = await repository.listScans({ search: "acme" });
    expect(acmeResults.total).toBe(1);
    expect(acmeResults.items[0].normalizedUrl).toContain("acme-corp.com");

    const noneResults = await repository.listScans({ search: "nonexistent-domain" });
    expect(noneResults.total).toBe(0);
  });

  it("filters listScans by in_progress status", async () => {
    const s1 = await repository.createQueuedScan({
      submittedUrl: "https://queued.com",
      normalizedUrl: "https://queued.com/",
    });
    const s2 = await repository.createQueuedScan({
      submittedUrl: "https://done.com",
      normalizedUrl: "https://done.com/",
    });
    await repository.completeScan(s2.id, createMockResult(95, 0, 0));

    const inProgress = await repository.listScans({ status: "in_progress" });
    expect(inProgress.total).toBe(1);
    expect(inProgress.items[0].id).toBe(s1.id);

    const completed = await repository.listScans({ status: "completed" });
    expect(completed.total).toBe(1);
    expect(completed.items[0].id).toBe(s2.id);
  });

  it("sorts scans by score and oldest correctly", async () => {
    const s1 = await repository.createQueuedScan({
      submittedUrl: "https://first.com",
      normalizedUrl: "https://first.com/",
    });
    await repository.completeScan(s1.id, createMockResult(60, 3, 0));

    const s2 = await repository.createQueuedScan({
      submittedUrl: "https://second.com",
      normalizedUrl: "https://second.com/",
    });
    await repository.completeScan(s2.id, createMockResult(95, 0, 0));

    const sortedByScore = await repository.listScans({
      sortBy: "score",
      sortDirection: "desc",
    });
    expect(sortedByScore.items[0].metrics?.automatedScore).toBe(95);
    expect(sortedByScore.items[1].metrics?.automatedScore).toBe(60);

    const sortedByOldest = await repository.listScans({
      sortBy: "oldest",
      sortDirection: "asc",
    });
    expect(sortedByOldest.items[0].id).toBe(s1.id);
  });
});
