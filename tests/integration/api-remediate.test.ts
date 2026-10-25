import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as remediateHandler } from "@/app/api/scans/[id]/remediate/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { ScanRepository } from "@/lib/db/scan-repository";
import { resetRateLimits } from "@/lib/security/rate-limiter";
import type { ScanResult } from "@/lib/scanner/types";

describe("Remediation & Health API Routes Integration Suite", () => {
  const repository = new ScanRepository();
  let validScanId: string;
  let validViolationId: string;

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
            target: ["img.hero"],
            htmlSnippet: '<img class="hero" src="/banner.jpg">',
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

  beforeEach(async () => {
    resetRateLimits();
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    validScanId = queued.id;
    await repository.completeScan(validScanId, sampleScanResult);
    const report = await repository.getFullScanReport(validScanId);
    validViolationId = report!.violations[0].id;
  });

  it("rejects non-JSON Content-Type with HTTP 415", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain text",
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(res.status).toBe(415);
  });

  it("rejects malformed JSON body with HTTP 400", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ invalid json ...",
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing violationId with HTTP 400", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns HTTP 404 for unknown scan ID", async () => {
    const req = new NextRequest(`http://localhost/api/scans/unknown-scan-id/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ violationId: validViolationId }),
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: "unknown-scan-id" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns HTTP 404 for violation not belonging to scan", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ violationId: "unrelated-violation-id" }),
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(res.status).toBe(404);
  });

  it("returns HTTP 200 with structured remediation (fallback when Ollama offline)", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ violationId: validViolationId }),
    });

    const res = await remediateHandler(req, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.remediation).toBeDefined();
    expect(data.remediation.explanation).toBeDefined();
    expect(data.remediation.recommendedFix).toBeDefined();
    expect(data.remediation.source).toBe("fallback");
  });

  it("enforces rate limits returning HTTP 429 when budget exceeded", async () => {
    // Send 30 requests (the limit)
    for (let i = 0; i < 30; i++) {
      const req = new NextRequest(`http://localhost/api/scans/${validScanId}/remediate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.99",
        },
        body: JSON.stringify({ violationId: validViolationId }),
      });
      const res = await remediateHandler(req, {
        params: Promise.resolve({ id: validScanId }),
      });
      expect(res.status).toBe(200);
    }

    // 31st request should be rate-limited
    const blockedReq = new NextRequest(
      `http://localhost/api/scans/${validScanId}/remediate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.99",
        },
        body: JSON.stringify({ violationId: validViolationId }),
      }
    );
    const blockedRes = await remediateHandler(blockedReq, {
      params: Promise.resolve({ id: validScanId }),
    });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeDefined();
  });

  it("health endpoint reports operational database status and safe Ollama status", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.database).toBe("connected");
    expect(data.scanner).toBe("ready");
    expect(data.ollama).toBeDefined();
    expect(typeof data.ollama.reachable).toBe("boolean");
    expect(data.ollama.configuredModel).toBeDefined();
  });
});
