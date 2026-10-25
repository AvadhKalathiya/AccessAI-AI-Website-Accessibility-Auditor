import type { FullScanReport } from "@/lib/db/scan-repository";
import type { RemediationResult } from "@/lib/ai/types";

export interface ScanCsvExportOptions {
  report: FullScanReport;
  remediations?: Record<string, RemediationResult>;
}

/**
 * Sanitizes a field against Spreadsheet Formula Injection (CSV Injection).
 * If a value starts with '=', '+', '-', '@', '\t', or '\r', prefixes with a single quote.
 */
export function sanitizeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // Prevent spreadsheet formula execution
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // RFC 4180 escaping: If field contains commas, quotes, or newlines, enclose in quotes and escape internal quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates an RFC 4180 compliant CSV export for a scan report.
 */
export function generateScanCsv(options: ScanCsvExportOptions): string {
  const { report, remediations = {} } = options;

  const headers = [
    "Scan ID",
    "Target URL",
    "Scan Date",
    "Scan Status",
    "Violation ID",
    "Rule ID",
    "Impact",
    "WCAG Tags",
    "Affected Count",
    "Selector",
    "HTML Snippet",
    "Failure Summary",
    "Suggested Remediation",
  ];

  const rows: string[][] = [];
  const scanDate = new Date(report.createdAt).toISOString();

  if (!report.violations || report.violations.length === 0) {
    // Return CSV with only headers if no violations exist
    return "\uFEFF" + headers.join(",") + "\r\n";
  }

  for (const v of report.violations) {
    const remediation = remediations[v.id]?.recommendedFix || v.helpText;
    const wcagTagsStr = v.wcagTags.join("; ");

    if (v.nodes && v.nodes.length > 0) {
      for (const node of v.nodes) {
        const selectorStr = node.targetSelectors.join(" > ");
        rows.push([
          report.id,
          report.normalizedUrl,
          scanDate,
          report.status,
          v.id,
          v.ruleId,
          v.impact,
          wcagTagsStr,
          String(v.affectedCount),
          selectorStr,
          node.htmlSnippet || "",
          node.failureSummary || "",
          remediation,
        ]);
      }
    } else {
      rows.push([
        report.id,
        report.normalizedUrl,
        scanDate,
        report.status,
        v.id,
        v.ruleId,
        v.impact,
        wcagTagsStr,
        String(v.affectedCount),
        "",
        "",
        "",
        remediation,
      ]);
    }
  }

  const csvContent = [
    headers.map(sanitizeCsvField).join(","),
    ...rows.map((row) => row.map(sanitizeCsvField).join(",")),
  ].join("\r\n") + "\r\n";

  // Prepend UTF-8 Byte Order Mark (BOM) for compatibility with Microsoft Excel
  return "\uFEFF" + csvContent;
}
