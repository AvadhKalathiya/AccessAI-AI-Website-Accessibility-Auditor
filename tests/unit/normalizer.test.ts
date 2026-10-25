import { describe, it, expect } from "vitest";
import {
  normalizeImpact,
  normalizeTarget,
  normalizeHtmlSnippet,
  normalizeViolations,
  calculateSeverityCounts,
  calculateAutomatedScore,
  normalizeAxeResults,
} from "@/lib/scanner/normalizer";
import type { Result as AxeRuleResult } from "axe-core";

describe("Accessibility Normalizer & Scoring Suite", () => {
  describe("Impact & Selector Normalization", () => {
    it("maps recognized impacts and falls back to unknown", () => {
      expect(normalizeImpact("critical")).toBe("critical");
      expect(normalizeImpact("SERIOUS")).toBe("serious");
      expect(normalizeImpact("Moderate")).toBe("moderate");
      expect(normalizeImpact("minor")).toBe("minor");
      expect(normalizeImpact(null)).toBe("unknown");
      expect(normalizeImpact("other")).toBe("unknown");
    });

    it("handles single and array target selectors including frame hierarchies", () => {
      expect(normalizeTarget("button.submit")).toEqual(["button.submit"]);
      expect(normalizeTarget(["div.main", "button.submit"])).toEqual(["div.main", "button.submit"]);
      expect(normalizeTarget([["iframe#auth", "input#user"]])).toEqual(["iframe#auth > input#user"]);
      expect(normalizeTarget(null)).toEqual(["unknown-target"]);
    });

    it("bounds HTML snippets and appends truncation note", () => {
      const shortSnippet = "<button>Click</button>";
      expect(normalizeHtmlSnippet(shortSnippet)).toBe(shortSnippet);

      const hugeSnippet = "<div class='long'>" + "x".repeat(600) + "</div>";
      const normalized = normalizeHtmlSnippet(hugeSnippet);
      expect(normalized.length).toBeLessThan(550);
      expect(normalized).toContain("[truncated]");
    });
  });

  describe("Rule Normalization and Severity Breakdown", () => {
    const sampleViolations: AxeRuleResult[] = [
      {
        id: "image-alt",
        impact: "critical",
        tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
        description: "Images must have alternate text",
        help: "Images must have alternate text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        nodes: [
          {
            target: ["img.hero"],
            html: "<img class='hero' src='hero.jpg'>",
            failureSummary: "Fix any of the following: Element does not have an alt attribute",
            any: [],
            all: [],
            none: [],
          },
          {
            target: ["img.banner"],
            html: "<img class='banner' src='banner.jpg'>",
            failureSummary: "Element does not have an alt attribute",
            any: [],
            all: [],
            none: [],
          },
        ],
      },
      {
        id: "color-contrast",
        impact: "serious",
        tags: ["cat.color", "wcag2aa", "wcag143"],
        description: "Elements must have sufficient color contrast",
        help: "Elements must have sufficient color contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        nodes: [
          {
            target: ["p.subtext"],
            html: "<p class='subtext'>Low contrast</p>",
            failureSummary: "Element has insufficient color contrast",
            any: [],
            all: [],
            none: [],
          },
        ],
      },
    ];

    it("preserves rule counts vs affected node counts", () => {
      const normalized = normalizeViolations(sampleViolations);
      expect(normalized.length).toBe(2);

      // image-alt has 2 nodes
      expect(normalized[0].affectedCount).toBe(2);
      expect(normalized[0].wcagTags).toContain("wcag111");

      // color-contrast has 1 node
      expect(normalized[1].affectedCount).toBe(1);

      const severity = calculateSeverityCounts(normalized);
      expect(severity.critical).toBe(1);
      expect(severity.serious).toBe(1);
      expect(severity.totalRules).toBe(2);
      expect(severity.totalAffectedElements).toBe(3); // 2 + 1
    });

    it("calculates automated score with penalties and caps", () => {
      const normalized = normalizeViolations(sampleViolations);

      // 100 - (15 for critical + 10 for serious + 0.5 for extra element) = 74.5 -> 75
      const score = calculateAutomatedScore(normalized);
      expect(score).toBe(75);
    });

    it("returns 100 for zero violations", () => {
      expect(calculateAutomatedScore([])).toBe(100);
    });

    it("transforms raw axe results into JSON-serializable structure defensively", () => {
      const raw = {
        testEngine: { name: "axe-core", version: "4.10.3" },
        violations: sampleViolations,
        passes: [{ id: "aria-roles" }] as any,
        incomplete: [] as any,
        inapplicable: [{ id: "video-caption" }] as any,
        toolOptions: {} as any,
        testRunner: {} as any,
        testEnvironment: {} as any,
        url: "https://example.com",
        timestamp: "2026-10-24T12:00:00Z",
      };

      const result = normalizeAxeResults(raw);
      expect(result.ruleCounts.violations).toBe(2);
      expect(result.ruleCounts.passed).toBe(1);
      expect(result.ruleCounts.inapplicable).toBe(1);
      expect(result.passedRuleIds).toContain("aria-roles");

      // Verify JSON serialization
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).toBeDefined();
      const parsed = JSON.parse(jsonStr);
      expect(parsed.severityCounts.totalAffectedElements).toBe(3);
    });
  });
});
