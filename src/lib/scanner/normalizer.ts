/**
 * Accessibility Results Normalization & Heuristic Scoring
 *
 * Pure, deterministic functions that map raw axe-core results into strict,
 * serializable domain models, extract DOM selectors and bounded HTML snippets,
 * calculate severity distributions, and compute an automated accessibility score.
 */

import type { AxeResults, Result as AxeRuleResult } from "axe-core";
import type {
  NormalizedViolation,
  ViolationImpact,
  AffectedNode,
  SeverityCounts,
  RuleCategoryCounts,
  IncompleteRule,
} from "./types";

/** Maximum character length for stored HTML snippets to prevent unbounded memory growth */
const MAX_HTML_SNIPPET_LENGTH = 500;

/**
 * Normalizes a raw impact string from axe-core into the standard domain union.
 */
export function normalizeImpact(rawImpact?: string | null): ViolationImpact {
  if (!rawImpact) return "unknown";
  const lower = rawImpact.toLowerCase();
  switch (lower) {
    case "critical":
    case "serious":
    case "moderate":
    case "minor":
      return lower;
    default:
      return "unknown";
  }
}

/**
 * Extracts and sanitizes target selectors (supporting frame hierarchies).
 */
export function normalizeTarget(rawTarget: unknown): string[] {
  if (!Array.isArray(rawTarget)) {
    return typeof rawTarget === "string" ? [rawTarget] : ["unknown-target"];
  }

  // Handle nested selector paths (e.g. [['iframe#login', 'button.submit']])
  const flattened: string[] = [];
  for (const item of rawTarget) {
    if (Array.isArray(item)) {
      flattened.push(item.map(String).join(" > "));
    } else if (item != null) {
      flattened.push(String(item));
    }
  }

  return flattened.length > 0 ? flattened : ["unknown-target"];
}

/**
 * Truncates and sanitizes HTML snippets safely.
 */
export function normalizeHtmlSnippet(rawHtml?: string | null): string {
  if (!rawHtml) return "";
  const trimmed = rawHtml.trim();
  if (trimmed.length <= MAX_HTML_SNIPPET_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_HTML_SNIPPET_LENGTH) + "... [truncated]";
}

/**
 * Normalizes an array of raw axe-core violation rules into typed domain models.
 */
export function normalizeViolations(axeViolations: AxeRuleResult[]): NormalizedViolation[] {
  if (!Array.isArray(axeViolations)) return [];

  return axeViolations.map((violation) => {
    const impact = normalizeImpact(violation.impact);
    const tags = Array.isArray(violation.tags) ? violation.tags.map(String) : [];
    const wcagTags = tags.filter((t) => t.startsWith("wcag"));

    const nodes: AffectedNode[] = Array.isArray(violation.nodes)
      ? violation.nodes.map((node) => {
          const rawRelated = (node as { relatedNodes?: Array<{ target?: unknown; html?: string }> }).relatedNodes;
          const relatedNodes = Array.isArray(rawRelated)
            ? rawRelated.map((related) => ({
                target: normalizeTarget(related?.target),
                htmlSnippet: normalizeHtmlSnippet(related?.html),
              }))
            : undefined;

          return {
            target: normalizeTarget(node.target),
            htmlSnippet: normalizeHtmlSnippet(node.html),
            failureSummary: node.failureSummary || violation.help || "",
            relatedNodes,
          };
        })
      : [];

    return {
      ruleId: String(violation.id || "unknown-rule"),
      impact,
      description: String(violation.description || ""),
      helpText: String(violation.help || ""),
      helpUrl: String(violation.helpUrl || ""),
      tags,
      wcagTags,
      affectedCount: nodes.length,
      nodes,
    };
  });
}

/**
 * Calculates severity counts distinguishing total violating rules vs total affected DOM elements.
 */
export function calculateSeverityCounts(violations: NormalizedViolation[]): SeverityCounts {
  let critical = 0;
  let serious = 0;
  let moderate = 0;
  let minor = 0;
  let unknown = 0;
  let totalAffectedElements = 0;

  for (const v of violations) {
    totalAffectedElements += v.affectedCount;
    switch (v.impact) {
      case "critical":
        critical++;
        break;
      case "serious":
        serious++;
        break;
      case "moderate":
        moderate++;
        break;
      case "minor":
        minor++;
        break;
      default:
        unknown++;
        break;
    }
  }

  return {
    critical,
    serious,
    moderate,
    minor,
    unknown,
    totalRules: violations.length,
    totalAffectedElements,
  };
}

/**
 * Computes an automated heuristic score (0-100).
 *
 * SCORING FORMULA:
 * Base score: 100
 * Penalty per critical rule: 15 points
 * Penalty per serious rule: 10 points
 * Penalty per moderate rule: 5 points
 * Penalty per minor rule: 2 points
 * Penalty per additional affected element beyond the first: 0.5 points (capped at 15 total element penalty)
 *
 * DISCLAIMER:
 * This score is a heuristic triage metric for comparing automated test runs.
 * It is NOT a percentage of WCAG conformance and must never be represented as legal compliance.
 */
export function calculateAutomatedScore(
  violations: NormalizedViolation[]
): number {
  if (violations.length === 0) {
    return 100;
  }

  let penalty = 0;
  let extraElements = 0;

  for (const v of violations) {
    switch (v.impact) {
      case "critical":
        penalty += 15;
        break;
      case "serious":
        penalty += 10;
        break;
      case "moderate":
        penalty += 5;
        break;
      case "minor":
        penalty += 2;
        break;
      default:
        penalty += 3;
        break;
    }
    if (v.affectedCount > 1) {
      extraElements += v.affectedCount - 1;
    }
  }

  // Cap element-level penalty to prevent unbounded deduction on large pages with repeating errors
  const elementPenalty = Math.min(extraElements * 0.5, 15);
  const totalDeduction = penalty + elementPenalty;

  return Math.max(0, Math.round(100 - totalDeduction));
}

/**
 * Normalizes incomplete checks requiring manual/assistive review.
 */
export function normalizeIncomplete(incompleteResults: AxeRuleResult[]): IncompleteRule[] {
  if (!Array.isArray(incompleteResults)) return [];

  return incompleteResults.map((r) => ({
    ruleId: String(r.id || "incomplete-rule"),
    impact: normalizeImpact(r.impact),
    description: String(r.description || ""),
    helpText: String(r.help || ""),
    helpUrl: String(r.helpUrl || ""),
    affectedCount: Array.isArray(r.nodes) ? r.nodes.length : 0,
  }));
}

export interface NormalizedAxeData {
  violations: NormalizedViolation[];
  incomplete: IncompleteRule[];
  severityCounts: SeverityCounts;
  ruleCounts: RuleCategoryCounts;
  automatedScore: number;
  passedRuleIds: string[];
  inapplicableRuleIds: string[];
}

/**
 * Transforms complete raw axe-core results into normalized, typed structures.
 */
export function normalizeAxeResults(rawResults: AxeResults): NormalizedAxeData {
  const violations = normalizeViolations(rawResults.violations || []);
  const incomplete = normalizeIncomplete(rawResults.incomplete || []);

  const passedRuleIds = Array.isArray(rawResults.passes)
    ? rawResults.passes.map((p) => String(p.id))
    : [];

  const inapplicableRuleIds = Array.isArray(rawResults.inapplicable)
    ? rawResults.inapplicable.map((i) => String(i.id))
    : [];

  const ruleCounts: RuleCategoryCounts = {
    violations: violations.length,
    incomplete: incomplete.length,
    passed: passedRuleIds.length,
    inapplicable: inapplicableRuleIds.length,
  };

  const severityCounts = calculateSeverityCounts(violations);
  const automatedScore = calculateAutomatedScore(violations);

  return {
    violations,
    incomplete,
    severityCounts,
    ruleCounts,
    automatedScore,
    passedRuleIds,
    inapplicableRuleIds,
  };
}
