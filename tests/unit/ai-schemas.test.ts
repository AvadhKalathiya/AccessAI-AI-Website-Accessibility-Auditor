import { describe, it, expect } from "vitest";
import {
  OllamaRemediationOutputSchema,
  RemediationResultSchema,
  RemediateRequestBodySchema,
} from "@/lib/ai/schemas";

describe("AI Remediation Schemas Suite", () => {
  const validOutput = {
    explanation: "The image is missing an accessible alternative text attribute.",
    whyItMatters: "Screen reader users cannot perceive the content or purpose of the image.",
    userImpact: "Blind and low-vision users encounter an unannounced visual barrier.",
    recommendedFix: "Add a descriptive alt attribute if informative, or alt=\"\" if decorative.",
    codeBefore: '<img src="header.jpg">',
    codeAfter: '<img src="header.jpg" alt="Company Logo">',
    codeExplanation: "Added alt='Company Logo' to provide accessible text.",
    testingSteps: [
      "Inspect the DOM to verify alt attribute.",
      "Check screen reader output.",
    ],
    limitations: "Human verification required to ensure alt text matches intent.",
  };

  it("validates valid LLM remediation structured output", () => {
    const result = OllamaRemediationOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("normalizes null or undefined code snippets to null", () => {
    const withoutCode = {
      ...validOutput,
      codeBefore: undefined,
      codeAfter: null,
      codeExplanation: undefined,
    };
    const result = OllamaRemediationOutputSchema.safeParse(withoutCode);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.codeBefore).toBeNull();
      expect(result.data.codeAfter).toBeNull();
      expect(result.data.codeExplanation).toBeNull();
    }
  });

  it("rejects output with missing explanation", () => {
    const invalid = { ...validOutput, explanation: undefined };
    const result = OllamaRemediationOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects output with excessively short explanation (< 10 chars)", () => {
    const invalid = { ...validOutput, explanation: "Fix it." };
    const result = OllamaRemediationOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects output exceeding maximum string bounds", () => {
    const invalid = {
      ...validOutput,
      explanation: "A".repeat(2500), // Max is 2000
    };
    const result = OllamaRemediationOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects output with empty testingSteps array", () => {
    const invalid = { ...validOutput, testingSteps: [] };
    const result = OllamaRemediationOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects output with too many testingSteps (> 8)", () => {
    const invalid = {
      ...validOutput,
      testingSteps: Array(10).fill("Step to verify"),
    };
    const result = OllamaRemediationOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("validates full domain RemediationResultSchema", () => {
    const domainResult = {
      ...validOutput,
      wcagCriteria: ["wcag111", "wcag21a"],
      provider: "ollama",
      model: "llama3.2",
      timestamp: new Date().toISOString(),
      source: "ollama" as const,
    };

    const parsed = RemediationResultSchema.safeParse(domainResult);
    expect(parsed.success).toBe(true);
  });

  it("validates RemediateRequestBodySchema", () => {
    expect(
      RemediateRequestBodySchema.safeParse({ violationId: "v-123" }).success
    ).toBe(true);
    expect(
      RemediateRequestBodySchema.safeParse({
        violationId: "v-123",
        regenerate: true,
      }).success
    ).toBe(true);
    expect(RemediateRequestBodySchema.safeParse({}).success).toBe(false);
    expect(
      RemediateRequestBodySchema.safeParse({ violationId: "" }).success
    ).toBe(false);
  });
});
