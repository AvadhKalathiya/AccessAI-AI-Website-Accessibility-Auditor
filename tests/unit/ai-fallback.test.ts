import { describe, it, expect } from "vitest";
import { generateDeterministicFallback } from "@/lib/ai/fallback";
import type { StoredViolationContext } from "@/lib/ai/types";

describe("Deterministic Fallback Remediation Engine Suite", () => {
  const createFinding = (
    ruleId: string,
    htmlSnippet = "<div />"
  ): StoredViolationContext => ({
    scanId: "scan-test",
    violationId: "viol-test",
    ruleId,
    impact: "serious",
    description: `Axe description for ${ruleId}`,
    helpText: `Fix guidance for ${ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${ruleId}`,
    tags: ["wcag2aa"],
    wcagTags: ["wcag143"],
    affectedCount: 1,
    selector: "#test",
    htmlSnippet,
    failureSummary: "Fix violation details",
  });

  const supportedRules = [
    "image-alt",
    "label",
    "button-name",
    "link-name",
    "html-has-lang",
    "document-title",
    "color-contrast",
    "aria-roles",
    "aria-required-attr",
  ];

  for (const ruleId of supportedRules) {
    it(`generates specialized guidance for supported rule '${ruleId}'`, () => {
      const finding = createFinding(ruleId, `<${ruleId}-element>`);
      const result = generateDeterministicFallback(finding);

      expect(result.source).toBe("fallback");
      expect(result.provider).toBe("deterministic-rule-engine");
      expect(result.model).toBeNull();
      expect(result.explanation.length).toBeGreaterThan(15);
      expect(result.whyItMatters.length).toBeGreaterThan(15);
      expect(result.recommendedFix.length).toBeGreaterThan(15);
      expect(result.testingSteps.length).toBeGreaterThanOrEqual(1);
      expect(result.limitations.length).toBeGreaterThan(10);
    });
  }

  it("does NOT hallucinate an image description for 'image-alt'", () => {
    const finding = createFinding("image-alt", '<img src="/photo.png">');
    const result = generateDeterministicFallback(finding);

    // Confirms it instructs the developer to provide a description rather than inventing one
    expect(result.recommendedFix).toContain("determine whether it is informative or decorative");
    expect(result.limitations).toContain("cannot determine whether this image is informative or decorative");
  });

  it("does NOT invent contrast values for 'color-contrast'", () => {
    const finding = createFinding("color-contrast", '<span style="color: grey">text</span>');
    const result = generateDeterministicFallback(finding);

    expect(result.recommendedFix).toContain("4.5:1");
    expect(result.limitations).toContain("cannot determine computed CSS colors defined in external stylesheets");
  });

  it("produces deterministic output for identical input", () => {
    const finding = createFinding("button-name", "<button><svg></svg></button>");
    const res1 = generateDeterministicFallback(finding);
    const res2 = generateDeterministicFallback(finding);

    expect(res1.explanation).toBe(res2.explanation);
    expect(res1.recommendedFix).toBe(res2.recommendedFix);
    expect(res1.codeAfter).toBe(res2.codeAfter);
  });

  it("handles unsupported rules with honest generic fallback", () => {
    const finding = createFinding("custom-unknown-rule", "<div>custom</div>");
    const result = generateDeterministicFallback(finding);

    expect(result.source).toBe("fallback");
    expect(result.provider).toBe("deterministic-rule-engine");
    expect(result.explanation).toContain("Fix guidance for custom-unknown-rule");
    expect(result.limitations).toContain("not yet customized for this rule ID");
  });

  it("handles empty HTML snippet gracefully", () => {
    const finding = createFinding("image-alt", "");
    const result = generateDeterministicFallback(finding);

    expect(result.codeBefore).toBeDefined();
    expect(result.codeAfter).toBeDefined();
  });
});
