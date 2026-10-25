import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { ScanRepository } from "@/lib/db/scan-repository";
import { RemediationService } from "@/lib/ai/remediation-service";
import { OllamaClient } from "@/lib/ai/ollama";
import type { ScanResult } from "@/lib/scanner/types";

describe("Remediation Service Integration Suite", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let repository: ScanRepository;

  const validModelOutput = {
    explanation: "This image element does not have an alternative text attribute.",
    whyItMatters: "Screen reader users cannot understand what the image depicts.",
    userImpact: "Screen readers announce only the raw URL or skip the element entirely.",
    recommendedFix: "Add an alt attribute with descriptive text or an empty string if decorative.",
    codeBefore: '<img src="/test.png">',
    codeAfter: '<img src="/test.png" alt="Test Logo">',
    codeExplanation: "Added alt='Test Logo' for accessibility.",
    testingSteps: ["Check DOM in devtools", "Test with screen reader"],
    limitations: "Developer must decide whether image is decorative or informative.",
  };

  const sampleScanResult: ScanResult = {
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
      totalAffectedElements: 1,
    },
    ruleCounts: {
      passed: 10,
      incomplete: 0,
      inapplicable: 5,
      violations: 1,
    },
    violations: [
      {
        ruleId: "image-alt",
        impact: "critical",
        description: "Ensures <img> elements have alternate text",
        helpText: "Images must have alternate text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        tags: ["wcag2a", "wcag111"],
        wcagTags: ["wcag111"],
        affectedCount: 1,
        nodes: [
          {
            target: ["img.banner"],
            htmlSnippet: '<img class="banner" src="/test.png">',
            failureSummary: "Element does not have an alt attribute",
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
    warnings: [],
    metadata: {
      axeVersion: "4.10.3",
      playwrightVersion: "1.50.0",
      browser: "Chromium",
      wcagStandardScope: ["wcag2a"],
    },
  };

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

  it("generates and persists AI remediation when Ollama is available", async () => {
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    await repository.completeScan(queued.id, sampleScanResult);

    const fullReport = await repository.getFullScanReport(queued.id);
    expect(fullReport).toBeDefined();
    const violation = fullReport!.violations[0];
    expect(violation).toBeDefined();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "llama3.2",
        message: {
          role: "assistant",
          content: JSON.stringify(validModelOutput),
        },
      }),
    });

    const ollamaClient = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "llama3.2",
    });

    const service = new RemediationService({ repository, ollamaClient });

    const result = await service.getOrGenerateRemediation({
      scanId: queued.id,
      violationId: violation.id,
    });

    expect(result.source).toBe("ollama");
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("llama3.2");
    expect(result.codeAfter).toBe(validModelOutput.codeAfter);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify stored in DB
    const cached = await repository.getRemediation(queued.id, violation.id);
    expect(cached).toBeDefined();
    expect(cached?.source).toBe("ollama");
  });

  it("returns cached remediation without calling Ollama when regenerate is false", async () => {
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    await repository.completeScan(queued.id, sampleScanResult);
    const fullReport = await repository.getFullScanReport(queued.id);
    const violation = fullReport!.violations[0];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "llama3.2",
        message: {
          role: "assistant",
          content: JSON.stringify(validModelOutput),
        },
      }),
    });

    const ollamaClient = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "llama3.2",
    });

    const service = new RemediationService({ repository, ollamaClient });

    // First call generates & caches
    await service.getOrGenerateRemediation({
      scanId: queued.id,
      violationId: violation.id,
      regenerate: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call reuses cache
    const cachedResult = await service.getOrGenerateRemediation({
      scanId: queued.id,
      violationId: violation.id,
      regenerate: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cachedResult.source).toBe("ollama");

    // Third call with regenerate: true invokes Ollama again
    await service.getOrGenerateRemediation({
      scanId: queued.id,
      violationId: violation.id,
      regenerate: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("falls back cleanly to deterministic engine when Ollama is offline", async () => {
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    await repository.completeScan(queued.id, sampleScanResult);
    const fullReport = await repository.getFullScanReport(queued.id);
    const violation = fullReport!.violations[0];

    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    const ollamaClient = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const service = new RemediationService({ repository, ollamaClient });

    const result = await service.getOrGenerateRemediation({
      scanId: queued.id,
      violationId: violation.id,
    });

    expect(result.source).toBe("fallback");
    expect(result.provider).toBe("deterministic-rule-engine");
    expect(result.model).toBeNull();
    expect(result.explanation).toContain("alt");

    // Check DB persistence of fallback
    const cached = await repository.getRemediation(queued.id, violation.id);
    expect(cached?.source).toBe("fallback");
  });

  it("throws SCAN_NOT_FOUND when scan does not exist", async () => {
    const service = new RemediationService({ repository });

    await expect(
      service.getOrGenerateRemediation({
        scanId: "non-existent-scan",
        violationId: "any-violation",
      })
    ).rejects.toThrowError(/not found/i);
  });

  it("throws VIOLATION_NOT_FOUND when violation does not belong to scan", async () => {
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    await repository.completeScan(queued.id, sampleScanResult);

    const service = new RemediationService({ repository });

    await expect(
      service.getOrGenerateRemediation({
        scanId: queued.id,
        violationId: "unrelated-violation-id",
      })
    ).rejects.toThrowError(/does not belong/i);
  });
});
