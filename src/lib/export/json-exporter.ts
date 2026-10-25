import type { FullScanReport } from "@/lib/db/scan-repository";
import type { RemediationResult } from "@/lib/ai/types";

export interface ScanJsonExportOptions {
  report: FullScanReport;
  remediations?: Record<string, RemediationResult>;
}

/**
 * Serializes a full scan report and associated remediation suggestions into
 * structured, exportable JSON.
 */
export function generateScanJson(options: ScanJsonExportOptions): string {
  const { report, remediations = {} } = options;

  const exportPayload = {
    $schema: "https://accessai.dev/schemas/scan-report-v1.json",
    accessaiVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    auditSummary: {
      scanId: report.id,
      submittedUrl: report.submittedUrl,
      normalizedUrl: report.normalizedUrl,
      finalNavigatedUrl: report.finalUrl || report.normalizedUrl,
      status: report.status,
      startedAt: report.startedAt ? new Date(report.startedAt).toISOString() : null,
      completedAt: report.completedAt ? new Date(report.completedAt).toISOString() : null,
      durationMs: report.durationMs,
      automatedScore: report.metrics?.automatedScore ?? null,
      totalRulesViolated: report.metrics?.totalRules ?? report.violations.length,
      totalAffectedElements: report.metrics?.totalAffectedElements ?? 0,
      severityCounts: {
        critical: report.metrics?.criticalRules ?? 0,
        serious: report.metrics?.seriousRules ?? 0,
        moderate: report.metrics?.moderateRules ?? 0,
        minor: report.metrics?.minorRules ?? 0,
        unknown: report.metrics?.unknownRules ?? 0,
      },
    },
    violations: report.violations.map((v) => ({
      violationId: v.id,
      ruleId: v.ruleId,
      impact: v.impact,
      description: v.description,
      helpText: v.helpText,
      helpUrl: v.helpUrl,
      tags: v.tags,
      wcagTags: v.wcagTags,
      affectedNodeCount: v.affectedCount,
      affectedNodes: v.nodes.map((n) => ({
        nodeId: n.id,
        selectors: n.targetSelectors,
        htmlSnippet: n.htmlSnippet,
        failureSummary: n.failureSummary,
      })),
      remediationAdvice: remediations[v.id] || null,
    })),
    scannerTelemetry: {
      hasTruncatedData: report.hasTruncatedData,
      warnings: report.warnings,
    },
    complianceDisclaimer:
      "Automated accessibility auditing detects approximately 30% to 57% of WCAG criteria. Manual verification with keyboard navigation, screen readers, and assistive technology is required for full accessibility conformance.",
  };

  return JSON.stringify(exportPayload, null, 2);
}
