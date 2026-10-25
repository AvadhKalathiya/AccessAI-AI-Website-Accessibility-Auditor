import PDFDocument from "pdfkit";
import type { FullScanReport } from "@/lib/db/scan-repository";
import type { RemediationResult } from "@/lib/ai/types";

export interface ScanPdfExportOptions {
  report: FullScanReport;
  remediations?: Record<string, RemediationResult>;
}

/**
 * Generates a structured PDF accessibility audit report using PDFKit.
 */
export async function generateScanPdf(
  options: ScanPdfExportOptions
): Promise<Buffer> {
  const { report, remediations = {} } = options;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
        info: {
          Title: `AccessAI Audit Report - ${report.id}`,
          Author: "AccessAI Automated Accessibility Engine",
          Subject: `Accessibility Audit for ${report.normalizedUrl}`,
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // --- COLOR PALETTE ---
      const primaryColor = "#0284c7"; // Sky 600
      const darkColor = "#0f172a"; // Slate 900
      const mutedColor = "#64748b"; // Slate 500
      const criticalColor = "#dc2626"; // Red 600
      const seriousColor = "#ea580c"; // Orange 600
      const moderateColor = "#d97706"; // Amber 600
      const minorColor = "#4b5563"; // Gray 600
      const successColor = "#16a34a"; // Green 600

      // --- HEADER & BRANDING ---
      doc.fontSize(22).fillColor(primaryColor).font("Helvetica-Bold").text("AccessAI");
      doc.fontSize(10).fillColor(mutedColor).font("Helvetica").text("Automated Web Accessibility Audit & Remediation Report", {
        continued: false,
      });

      doc.moveDown(0.5);
      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // --- EXECUTIVE SUMMARY SECTION ---
      doc.fontSize(14).fillColor(darkColor).font("Helvetica-Bold").text("Executive Summary");
      doc.moveDown(0.5);

      const score = report.metrics?.automatedScore ?? 0;
      const scoreColor = score >= 80 ? successColor : score >= 50 ? moderateColor : criticalColor;

      doc.fontSize(10).fillColor(darkColor).font("Helvetica-Bold").text("Target URL: ", { continued: true });
      doc.font("Helvetica").fillColor(primaryColor).text(report.normalizedUrl);

      doc.fontSize(10).fillColor(darkColor).font("Helvetica-Bold").text("Scan ID: ", { continued: true });
      doc.font("Helvetica").fillColor(mutedColor).text(report.id);

      doc.fontSize(10).fillColor(darkColor).font("Helvetica-Bold").text("Scan Date: ", { continued: true });
      doc.font("Helvetica").fillColor(mutedColor).text(new Date(report.createdAt).toUTCString());

      doc.fontSize(10).fillColor(darkColor).font("Helvetica-Bold").text("Scan Status: ", { continued: true });
      doc.font("Helvetica").fillColor(report.status === "completed" ? successColor : criticalColor).text(report.status.toUpperCase());

      doc.moveDown(0.5);

      // Metrics Summary Table
      doc.fontSize(11).fillColor(darkColor).font("Helvetica-Bold").text("Automated Audit Metrics:");
      doc.moveDown(0.3);

      doc.fontSize(10).font("Helvetica");
      doc.fillColor(scoreColor).text(`• Automated Health Score: ${score}/100`);
      doc.fillColor(darkColor).text(`• Total Rule Violations: ${report.metrics?.totalRules ?? report.violations.length}`);
      doc.text(`• Total Affected DOM Elements: ${report.metrics?.totalAffectedElements ?? 0}`);
      doc.fillColor(criticalColor).text(`  - Critical: ${report.metrics?.criticalRules ?? 0}`);
      doc.fillColor(seriousColor).text(`  - Serious: ${report.metrics?.seriousRules ?? 0}`);
      doc.fillColor(moderateColor).text(`  - Moderate: ${report.metrics?.moderateRules ?? 0}`);
      doc.fillColor(minorColor).text(`  - Minor: ${report.metrics?.minorRules ?? 0}`);

      doc.moveDown(1);
      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);

      // --- VIOLATIONS SECTION ---
      doc.fontSize(14).fillColor(darkColor).font("Helvetica-Bold").text("Accessibility Findings & Remediation Guidance");
      doc.moveDown(0.5);

      if (!report.violations || report.violations.length === 0) {
        doc.fontSize(10).fillColor(successColor).font("Helvetica").text("No automated rule violations were detected on this page.");
      } else {
        const MAX_PDF_VIOLATIONS = 150;
        const violationsToRender = report.violations.slice(0, MAX_PDF_VIOLATIONS);

        if (report.violations.length > MAX_PDF_VIOLATIONS) {
          doc.fontSize(9).fillColor(seriousColor).font("Helvetica-Oblique").text(
            `Note: Displaying the first ${MAX_PDF_VIOLATIONS} of ${report.violations.length} violations in this PDF. Refer to JSON or CSV export for the complete dataset.`
          );
          doc.moveDown(0.5);
        }

        violationsToRender.forEach((v, index) => {
          // Check if page break needed
          if (doc.y > 680) {
            doc.addPage();
          }

          const impactColor =
            v.impact === "critical"
              ? criticalColor
              : v.impact === "serious"
              ? seriousColor
              : v.impact === "moderate"
              ? moderateColor
              : minorColor;

          doc.fontSize(11).fillColor(impactColor).font("Helvetica-Bold").text(
            `${index + 1}. [${v.impact.toUpperCase()}] ${v.ruleId}`,
            { continued: false }
          );

          doc.fontSize(9).fillColor(darkColor).font("Helvetica").text(v.description);
          doc.fontSize(8).fillColor(mutedColor).text(
            `WCAG Criteria: ${v.wcagTags.join(", ") || "General"} | Affected Elements: ${v.affectedCount}`
          );

          // Node Selectors & Snippets (up to first 2 nodes)
          if (v.nodes && v.nodes.length > 0) {
            doc.moveDown(0.3);
            doc.fontSize(8).fillColor(darkColor).font("Helvetica-Bold").text("Affected Selectors:");
            v.nodes.slice(0, 2).forEach((n) => {
              doc.fontSize(8).fillColor(mutedColor).font("Courier").text(`  ${n.targetSelectors.join(" ")}`);
              if (n.htmlSnippet) {
                const cleanSnippet = n.htmlSnippet.slice(0, 150).replace(/\s+/g, " ");
                doc.fontSize(8).fillColor("#334155").font("Courier-Oblique").text(`  Snippet: ${cleanSnippet}`);
              }
            });
          }

          // Remediation guidance
          const remediation = remediations[v.id]?.recommendedFix || v.helpText;
          doc.moveDown(0.3);
          doc.fontSize(8).fillColor(primaryColor).font("Helvetica-Bold").text("Remediation Advice:");
          doc.fontSize(8).fillColor(darkColor).font("Helvetica").text(remediation);

          doc.moveDown(0.8);
        });
      }

      // --- FINAL DISCLAIMER & MANUAL TESTING CHECKLIST ---
      if (doc.y > 620) {
        doc.addPage();
      }

      doc.moveDown(1);
      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);

      doc.fontSize(11).fillColor(darkColor).font("Helvetica-Bold").text("Verification Checklist & Limitations Disclaimer");
      doc.moveDown(0.3);

      doc.fontSize(8).fillColor(mutedColor).font("Helvetica").text(
        "Automated accessibility audits detect between 30% and 57% of WCAG success criteria. " +
        "Critical user experience factors—such as keyboard navigation order, focus visibility, screen reader clarity, " +
        "and contextual validity of alternate text—require thorough human verification.",
        { align: "justify" }
      );

      doc.moveDown(0.4);
      doc.fontSize(8).fillColor(darkColor).font("Helvetica-Bold").text("Recommended Next Steps:");
      doc.fontSize(8).font("Helvetica").fillColor(darkColor);
      doc.text("1. Verify keyboard focus order using Tab / Shift+Tab across interactive components.");
      doc.text("2. Test user journeys with screen readers (NVDA on Windows, VoiceOver on macOS/iOS).");
      doc.text("3. Validate color combinations against WCAG 2.1 Level AA (4.5:1 text, 3:1 graphical elements).");
      doc.text("4. Review all AI-generated code snippets in application context prior to deployment.");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
