import { describe, it, expect } from "vitest";
import { generateScanJson } from "@/lib/export/json-exporter";
import type { FullScanReport } from "@/lib/db/scan-repository";
import type { RemediationResult } from "@/lib/ai/types";

describe("JSON Report Exporter Suite", () => {
  const sampleReport: FullScanReport = {
    id: "scan-test-1234",
    submittedUrl: "https://example.com",
    normalizedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: "completed",
    progressStage: "completed",
    statusMessage: "Scan completed successfully.",
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    startedAt: Date.now() - 55000,
    completedAt: Date.now(),
    durationMs: 5000,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    hasTruncatedData: false,
    warnings: [],
    scannerMetadata: { browser: "Chromium" },
    metrics: {
      automatedScore: 78,
      totalRules: 1,
      totalAffectedElements: 2,
      criticalRules: 1,
      seriousRules: 0,
      moderateRules: 0,
      minorRules: 0,
      unknownRules: 0,
      passedRules: 15,
      incompleteChecks: 0,
      inapplicableRules: 25,
    },
    violations: [
      {
        id: "v-1",
        ruleId: "image-alt",
        impact: "critical",
        description: "Images must have alt text",
        helpText: "Provide alternative text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        tags: ["wcag2a", "wcag111"],
        wcagTags: ["wcag111"],
        affectedCount: 2,
        nodes: [
          {
            id: "n-1",
            targetSelectors: ["img#hero"],
            htmlSnippet: '<img id="hero" src="hero.jpg">',
            failureSummary: "Missing alt attribute",
          },
        ],
      },
    ],
  };

  const sampleRemediation: RemediationResult = {
    explanation: "The image is missing alt attribute.",
    whyItMatters: "Screen reader users cannot read it.",
    userImpact: "Blocks blind users from understanding image.",
    wcagCriteria: ["wcag111"],
    recommendedFix: "Add alt='Hero banner'.",
    codeBefore: '<img id="hero" src="hero.jpg">',
    codeAfter: '<img id="hero" src="hero.jpg" alt="Hero banner">',
    codeExplanation: "Added alt attribute.",
    testingSteps: ["Check with NVDA."],
    limitations: "Human verification required.",
    provider: "ollama",
    model: "llama3.2",
    timestamp: new Date().toISOString(),
    source: "ollama",
  };

  it("serializes full scan report into valid JSON format", () => {
    const jsonStr = generateScanJson({
      report: sampleReport,
      remediations: { "v-1": sampleRemediation },
    });

    expect(typeof jsonStr).toBe("string");
    const parsed = JSON.parse(jsonStr);

    expect(parsed.auditSummary.scanId).toBe("scan-test-1234");
    expect(parsed.auditSummary.automatedScore).toBe(78);
    expect(parsed.violations.length).toBe(1);
    expect(parsed.violations[0].ruleId).toBe("image-alt");
    expect(parsed.violations[0].remediationAdvice).toBeDefined();
    expect(parsed.violations[0].remediationAdvice.provider).toBe("ollama");
    expect(parsed.complianceDisclaimer).toBeDefined();
  });

  it("handles report with zero violations", () => {
    const emptyReport = {
      ...sampleReport,
      violations: [],
      metrics: {
        ...sampleReport.metrics!,
        totalRules: 0,
        totalAffectedElements: 0,
      },
    };
    const jsonStr = generateScanJson({ report: emptyReport });
    const parsed = JSON.parse(jsonStr);

    expect(parsed.violations).toEqual([]);
    expect(parsed.auditSummary.totalRulesViolated).toBe(0);
  });

  it("does not leak internal database paths or server secrets", () => {
    const jsonStr = generateScanJson({ report: sampleReport });
    expect(jsonStr).not.toContain("better-sqlite3");
    expect(jsonStr).not.toContain("DATABASE_URL");
    expect(jsonStr).not.toContain("process.env");
  });
});
