import { describe, it, expect } from "vitest";
import { generateScanPdf } from "@/lib/export/pdf-exporter";
import type { FullScanReport } from "@/lib/db/scan-repository";
import type { RemediationResult } from "@/lib/ai/types";

describe("PDF Report Exporter Suite", () => {
  const sampleReport: FullScanReport = {
    id: "scan-pdf-test",
    submittedUrl: "https://example.com",
    normalizedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    status: "completed",
    progressStage: "completed",
    statusMessage: "Audit completed.",
    createdAt: 1700000000000,
    updatedAt: 1700000005000,
    startedAt: 1700000001000,
    completedAt: 1700000005000,
    durationMs: 4000,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    hasTruncatedData: false,
    warnings: [],
    scannerMetadata: null,
    metrics: {
      automatedScore: 82,
      totalRules: 1,
      totalAffectedElements: 1,
      criticalRules: 1,
      seriousRules: 0,
      moderateRules: 0,
      minorRules: 0,
      unknownRules: 0,
      passedRules: 18,
      incompleteChecks: 0,
      inapplicableRules: 22,
    },
    violations: [
      {
        id: "v-pdf-1",
        ruleId: "button-name",
        impact: "critical",
        description: "Buttons must have discernible text",
        helpText: "Add visible text or aria-label to button",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
        tags: ["wcag2a", "wcag412"],
        wcagTags: ["wcag412"],
        affectedCount: 1,
        nodes: [
          {
            id: "n-pdf-1",
            targetSelectors: ["button.icon-btn"],
            htmlSnippet: '<button class="icon-btn"><svg></svg></button>',
            failureSummary: "Element does not have inner text",
          },
        ],
      },
    ],
  };

  const sampleRemediation: RemediationResult = {
    explanation: "Button has no accessible name.",
    whyItMatters: "Screen reader users cannot tell what it does.",
    userImpact: "Interactive element announced as empty button.",
    wcagCriteria: ["wcag412"],
    recommendedFix: "Add aria-label='Close modal'.",
    codeBefore: "<button><svg></svg></button>",
    codeAfter: "<button aria-label='Close modal'><svg></svg></button>",
    codeExplanation: "Added accessible name.",
    testingSteps: ["Check with screen reader."],
    limitations: "Check button action in visual context.",
    provider: "ollama",
    model: "llama3.2",
    timestamp: new Date().toISOString(),
    source: "ollama",
  };

  it("generates a valid, non-empty PDF binary buffer starting with %PDF-", async () => {
    const pdfBuffer = await generateScanPdf({
      report: sampleReport,
      remediations: { "v-pdf-1": sampleRemediation },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify valid PDF file signature %PDF-
    const signature = pdfBuffer.subarray(0, 5).toString("utf-8");
    expect(signature).toBe("%PDF-");
  });

  it("handles a report with zero violations cleanly without throwing", async () => {
    const emptyReport = { ...sampleReport, violations: [] };
    const pdfBuffer = await generateScanPdf({ report: emptyReport });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
