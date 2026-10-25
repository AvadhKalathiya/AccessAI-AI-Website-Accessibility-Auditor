/**
 * AccessAI Scanning Engine — Type Contracts & Domain Models
 *
 * Strict, serializable contracts for scan options, normalized accessibility violations,
 * affected DOM nodes, timing telemetry, severity breakdowns, and overall scan results.
 */

export type ViolationImpact = "critical" | "serious" | "moderate" | "minor" | "unknown";

export type ScanStatus =
  | "pending"
  | "navigating"
  | "auditing"
  | "completed"
  | "failed"
  | "timed_out";

export type ScannerErrorCode =
  | "INVALID_TARGET"
  | "BLOCKED_DESTINATION"
  | "DNS_FAILURE"
  | "NAVIGATION_TIMEOUT"
  | "TARGET_UNAVAILABLE"
  | "BROWSER_LAUNCH_FAILED"
  | "AXE_AUDIT_FAILED"
  | "AXE_TIMEOUT"
  | "SCAN_TIMEOUT"
  | "INTERNAL_ERROR";

export interface ScannerErrorDetails {
  code: ScannerErrorCode;
  clientMessage: string;
  technicalDetails?: string;
}

export interface AffectedNode {
  /** Target CSS selector path or frame hierarchy (e.g. ['div#main > button.submit']) */
  target: string[];
  /** Bounded, sanitized HTML snippet of the offending element (max 500 chars) */
  htmlSnippet: string;
  /** axe-core failure explanation / summary for this specific node */
  failureSummary: string;
  /** Related nodes that caused or relate to this failure (e.g. conflicting ARIA elements) */
  relatedNodes?: Array<{
    target: string[];
    htmlSnippet: string;
  }>;
}

export interface NormalizedViolation {
  /** Unique rule identifier from axe-core (e.g., 'color-contrast', 'image-alt') */
  ruleId: string;
  /** Impact severity level */
  impact: ViolationImpact;
  /** Plain English description of the accessibility requirement */
  description: string;
  /** Recommended remediation advice from the rule engine */
  helpText: string;
  /** Deque University / W3C reference documentation URL */
  helpUrl: string;
  /** All tags associated with this rule (e.g., 'cat.color', 'wcag2aa', 'wcag143') */
  tags: string[];
  /** Specific WCAG criteria tags extracted from rule tags */
  wcagTags: string[];
  /** Number of individual DOM elements violating this specific rule */
  affectedCount: number;
  /** Detailed node-level failure representations */
  nodes: AffectedNode[];
}

export interface SeverityCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  unknown: number;
  /** Total number of distinct violating rules */
  totalRules: number;
  /** Total number of distinct DOM element nodes affected across all rules */
  totalAffectedElements: number;
}

export interface RuleCategoryCounts {
  passed: number;
  incomplete: number;
  inapplicable: number;
  violations: number;
}

export interface ScanTiming {
  startedAt: string;
  navigationCompletedAt?: string;
  auditCompletedAt?: string;
  finishedAt: string;
  /** Total execution duration in milliseconds */
  durationMs: number;
}

export interface ScanOptions {
  /** Target URL to audit */
  url: string;
  /** Maximum overall scan timeout in milliseconds (default: 35000) */
  overallTimeoutMs?: number;
  /** Page navigation timeout in milliseconds (default: 25000) */
  navigationTimeoutMs?: number;
  /** axe-core evaluation timeout in milliseconds (default: 10000) */
  axeTimeoutMs?: number;
  /** Viewport width in pixels (default: 1280) */
  viewportWidth?: number;
  /** Viewport height in pixels (default: 800) */
  viewportHeight?: number;
  /** Include best-practice rules in addition to WCAG standards (default: true) */
  includeBestPractices?: boolean;
  /** Custom user agent string */
  userAgent?: string;
  /** Optional progress callback during scan execution */
  onProgress?: (stage: "validating" | "navigating" | "auditing" | "saving", message: string) => void | Promise<void>;
}

export interface IncompleteRule {
  ruleId: string;
  impact?: ViolationImpact;
  description: string;
  helpText: string;
  helpUrl: string;
  affectedCount: number;
}

export interface ScanResult {
  /** Initial requested URL */
  requestedUrl: string;
  /** Final resolved URL after following authorized redirects */
  finalUrl: string;
  /** Scan completion status */
  status: ScanStatus;
  /** Whether the scan completed successfully */
  success: boolean;
  /** Overall automated accessibility health score (0-100 heuristic; NOT full WCAG conformance) */
  automatedScore: number;
  /** Severity breakdown distinguishing rules vs affected elements */
  severityCounts: SeverityCounts;
  /** Rule counts by execution category */
  ruleCounts: RuleCategoryCounts;
  /** Normalized accessibility violations */
  violations: NormalizedViolation[];
  /** Incomplete checks requiring human/assistive review */
  incomplete: IncompleteRule[];
  /** List of axe-core rule IDs that successfully passed on this page */
  passedRuleIds: string[];
  /** List of axe-core rule IDs that were inapplicable to this page */
  inapplicableRuleIds: string[];
  /** Telemetry timing data */
  timing: ScanTiming;
  /** Scanner error details if the scan failed */
  error?: ScannerErrorDetails;
  /** Diagnostic warnings (e.g. SPAs with delayed hydration, missing frames) */
  warnings: string[];
  /** Metadata describing the scanner runtime */
  metadata: {
    axeVersion: string;
    playwrightVersion: string;
    browser: string;
    wcagStandardScope: string[];
  };
}
