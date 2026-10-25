import { describe, it, expect } from "vitest";
import { generateScanCsv, sanitizeCsvField } from "@/lib/export/csv-exporter";
import type { FullScanReport } from "@/lib/db/scan-repository";

describe("CSV Report Exporter & Formula Injection Defense Suite", () => {
  describe("sanitizeCsvField", () => {
    it("neutralizes formula injection characters (=, +, -, @, \\t, \\r)", () => {
      expect(sanitizeCsvField("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvField("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
      expect(sanitizeCsvField("-100")).toBe("'-100");
      expect(sanitizeCsvField("@malicious")).toBe("'@malicious");
      expect(sanitizeCsvField("\tTabInjected")).toBe("'\tTabInjected");
    });

    it("escapes fields containing commas, quotes, and newlines per RFC 4180", () => {
      expect(sanitizeCsvField('Hello, "World"')).toBe('"Hello, ""World"""');
      expect(sanitizeCsvField("Line1\nLine2")).toBe('"Line1\nLine2"');
      expect(sanitizeCsvField("Safe String")).toBe("Safe String");
    });

    it("handles null and undefined values safely", () => {
      expect(sanitizeCsvField(null)).toBe("");
      expect(sanitizeCsvField(undefined)).toBe("");
    });
  });

  describe("generateScanCsv", () => {
    const sampleReport: FullScanReport = {
      id: "scan-csv-1",
      submittedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      status: "completed",
      progressStage: "completed",
      statusMessage: "Scan completed.",
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
        automatedScore: 80,
        totalRules: 1,
        totalAffectedElements: 1,
        criticalRules: 1,
        seriousRules: 0,
        moderateRules: 0,
        minorRules: 0,
        unknownRules: 0,
        passedRules: 10,
        incompleteChecks: 0,
        inapplicableRules: 20,
      },
      violations: [
        {
          id: "v-csv-1",
          ruleId: "color-contrast",
          impact: "serious",
          description: "Text must have sufficient color contrast",
          helpText: "Ensure 4.5:1 ratio",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
          tags: ["wcag2aa", "wcag143"],
          wcagTags: ["wcag143"],
          affectedCount: 1,
          nodes: [
            {
              id: "n-csv-1",
              targetSelectors: ["p.muted-text"],
              htmlSnippet: '<p class="muted-text">Low contrast</p>',
              failureSummary: "Expected 4.5:1 contrast, received 2.1:1",
            },
          ],
        },
      ],
    };

    it("begins with UTF-8 BOM for Microsoft Excel compatibility", () => {
      const csv = generateScanCsv({ report: sampleReport });
      expect(csv.startsWith("\uFEFF")).toBe(true);
    });

    it("includes standard headers and violation rows", () => {
      const csv = generateScanCsv({ report: sampleReport });
      expect(csv).toContain("Scan ID,Target URL,Scan Date,Scan Status,Violation ID,Rule ID,Impact");
      expect(csv).toContain("scan-csv-1");
      expect(csv).toContain("color-contrast");
      expect(csv).toContain("serious");
      expect(csv).toContain("wcag143");
      expect(csv).toContain("p.muted-text");
    });

    it("generates valid header-only CSV when report has zero violations", () => {
      const emptyReport = { ...sampleReport, violations: [] };
      const csv = generateScanCsv({ report: emptyReport });

      expect(csv.startsWith("\uFEFFScan ID,Target URL")).toBe(true);
      const lines = csv.trim().split("\r\n");
      expect(lines.length).toBe(1);
    });
  });
});
