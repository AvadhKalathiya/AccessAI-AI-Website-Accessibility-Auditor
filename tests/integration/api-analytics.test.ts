import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as analyticsHandler } from "@/app/api/analytics/summary/route";
import { ScanRepository } from "@/lib/db/scan-repository";
import type { ScanResult } from "@/lib/scanner/types";

describe("Analytics Summary API Route Integration Suite", () => {
  const repository = new ScanRepository();

  const sampleResult: ScanResult = {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: "completed",
    success: true,
    automatedScore: 84,
    severityCounts: {
      critical: 1,
      serious: 1,
      moderate: 0,
      minor: 0,
      unknown: 0,
      totalRules: 2,
      totalAffectedElements: 3,
    },
    ruleCounts: { passed: 10, incomplete: 0, inapplicable: 20, violations: 2 },
    violations: [
      {
        ruleId: "image-alt",
        impact: "critical",
        description: "Missing alt",
        helpText: "Add alt",
        helpUrl: "https://example.com/rules",
        tags: ["wcag2a"],
        wcagTags: ["wcag111"],
        affectedCount: 2,
        nodes: [
          { target: ["img"], htmlSnippet: "<img>", failureSummary: "alt missing" },
        ],
      },
    ],
    incomplete: [],
    passedRuleIds: ["aria-roles"],
    inapplicableRuleIds: ["video-caption"],
    timing: { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1500 },
    warnings: [],
    metadata: { axeVersion: "4.10.3", playwrightVersion: "1.50.0", browser: "Chromium", wcagStandardScope: ["wcag2a"] },
  };

  beforeEach(async () => {
    const s = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    await repository.completeScan(s.id, sampleResult);
  });

  it("returns HTTP 200 with complete analytics structure", async () => {
    const req = new NextRequest("http://localhost/api/analytics/summary?days=30");
    const res = await analyticsHandler(req);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rangeDays).toBe(30);
    expect(data.totalScans).toBeGreaterThanOrEqual(1);
    expect(data.completedScans).toBeGreaterThanOrEqual(1);
    expect(data.totalViolations).toBeGreaterThanOrEqual(2);
    expect(data.severityDistribution).toBeDefined();
    expect(data.trends).toBeDefined();
    expect(Array.isArray(data.trends)).toBe(true);
    expect(data.topRules).toBeDefined();
    expect(data.topDomains).toBeDefined();
  });

  it("accepts days=7 and days=90 query parameters", async () => {
    const req7 = new NextRequest("http://localhost/api/analytics/summary?days=7");
    const res7 = await analyticsHandler(req7);
    expect(res7.status).toBe(200);
    const data7 = await res7.json();
    expect(data7.rangeDays).toBe(7);

    const req90 = new NextRequest("http://localhost/api/analytics/summary?days=90");
    const res90 = await analyticsHandler(req90);
    expect(res90.status).toBe(200);
    const data90 = await res90.json();
    expect(data90.rangeDays).toBe(90);
  });

  it("returns HTTP 400 when days is not a valid number or out of bounds", async () => {
    const req = new NextRequest("http://localhost/api/analytics/summary?days=invalid");
    const res = await analyticsHandler(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid 'days' parameter");
  });
});
