/**
 * AccessAI Remediation Engine — Types & Data Contracts
 *
 * Defines domain models for AI-assisted accessibility remediation,
 * distinguishing verified scanner facts from generated recommendations.
 */

export type RemediationSource = "ollama" | "fallback";

export interface RemediationResult {
  /** Plain-English explanation of what accessibility issue was detected */
  explanation: string;

  /** Explanation of why this accessibility barrier matters */
  whyItMatters: string;

  /** Potential user impact on people using screen readers or assistive tech */
  userImpact: string;

  /** Relevant WCAG success criteria tags (e.g. ['wcag111', 'wcag143']) */
  wcagCriteria: string[];

  /** Practical, step-by-step remediation advice */
  recommendedFix: string;

  /** Suggested HTML/CSS code snippet before the fix (where available) */
  codeBefore: string | null;

  /** Suggested accessible HTML/CSS code snippet after the fix */
  codeAfter: string | null;

  /** Plain-English explanation of the proposed code modifications */
  codeExplanation: string | null;

  /** Verification and manual testing instructions */
  testingSteps: string[];

  /** Limitations, caveats, and reminder that human review is required */
  limitations: string;

  /** Remediation provider name ('ollama' or 'deterministic-rule-engine') */
  provider: string;

  /** Name of the local LLM used, or null for rule-based fallback */
  model: string | null;

  /** Generation ISO timestamp */
  timestamp: string;

  /** Origin of the remediation: live Ollama inference or deterministic fallback */
  source: RemediationSource;
}

export interface StoredViolationContext {
  scanId: string;
  violationId: string;
  ruleId: string;
  impact: string;
  description: string;
  helpText: string;
  helpUrl: string;
  tags: string[];
  wcagTags: string[];
  affectedCount: number;
  selector: string;
  htmlSnippet: string;
  failureSummary: string;
}
