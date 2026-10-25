import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as exportHandler } from "@/app/api/scans/[id]/export/route";
import { ScanRepository } from "@/lib/db/scan-repository";
import type { ScanResult } from "@/lib/scanner/types";

describe("Scan Report Multi-Format Export API Suite", () => {
  const repository = new ScanRepository();
  let validScanId: string;

  const sampleScanResult: ScanResult = {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: "completed",
    success: true,
    automatedScore: 88,
    severityCounts: {
      critical: 1,
      serious: 0,
      moderate: 0,
      minor: 0,
      unknown: 0,
      totalRules: 1,
      totalAffectedElements: 1,
    },
    ruleCounts: { passed: 15, incomplete: 0, inapplicable: 20, violations: 1 },
    violations: [
      {
        ruleId: "document-title",
        impact: "moderate",
        description: "Documents must have a title element",
        helpText: "Include a non-empty <title> element in the head",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/document-title",
        tags: ["wcag2a", "wcag242"],
        wcagTags: ["wcag242"],
        affectedCount: 1,
        nodes: [
          {
            target: ["html"],
            htmlSnippet: "<html><head></head></html>",
            failureSummary: "Missing title element",
          },
        ],
      },
    ],
    incomplete: [],
    passedRuleIds: ["aria-roles"],
    inapplicableRuleIds: ["video-caption"],
    timing: { startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1800 },
    warnings: [],
    metadata: { axeVersion: "4.10.3", playwrightVersion: "1.50.0", browser: "Chromium", wcagStandardScope: ["wcag2a"] },
  };

  beforeEach(async () => {
    const queued = await repository.createQueuedScan({
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
    });
    validScanId = queued.id;
    await repository.completeScan(validScanId, sampleScanResult);
  });

  it("exports report as JSON with application/json headers", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/export?format=json`);
    const res = await exportHandler(req, { params: Promise.resolve({ id: validScanId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain(`attachment; filename="accessai-report-${validScanId.slice(0, 8)}.json"`);

    const json = await res.json();
    expect(json.auditSummary.scanId).toBe(validScanId);
    expect(json.auditSummary.automatedScore).toBe(88);
    expect(json.violations[0].ruleId).toBe("document-title");
  });

  it("exports report as CSV with text/csv headers and UTF-8 BOM", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/export?format=csv`);
    const res = await exportHandler(req, { params: Promise.resolve({ id: validScanId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(`attachment; filename="accessai-report-${validScanId.slice(0, 8)}.csv"`);

    const buffer = Buffer.from(await res.arrayBuffer());
    // Verify UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
    const text = buffer.toString("utf-8");
    expect(text).toContain("document-title");
    expect(text).toContain("moderate");
  });

  it("exports report as PDF with application/pdf headers and valid %PDF- signature", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/export?format=pdf`);
    const res = await exportHandler(req, { params: Promise.resolve({ id: validScanId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(`attachment; filename="accessai-report-${validScanId.slice(0, 8)}.pdf"`);

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("returns HTTP 400 when an unsupported format is requested", async () => {
    const req = new NextRequest(`http://localhost/api/scans/${validScanId}/export?format=xml`);
    const res = await exportHandler(req, { params: Promise.resolve({ id: validScanId }) });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unsupported export format");
  });

  it("returns HTTP 404 when scan ID does not exist", async () => {
    const req = new NextRequest(`http://localhost/api/scans/non-existent-scan/export?format=json`);
    const res = await exportHandler(req, { params: Promise.resolve({ id: "non-existent-scan" }) });

    expect(res.status).toBe(404);
  });
});
