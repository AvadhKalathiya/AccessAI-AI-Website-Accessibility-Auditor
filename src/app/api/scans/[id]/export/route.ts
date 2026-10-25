import { NextRequest, NextResponse } from "next/server";
import { ScanRepository } from "@/lib/db/scan-repository";
import { generateScanJson } from "@/lib/export/json-exporter";
import { generateScanCsv } from "@/lib/export/csv-exporter";
import { generateScanPdf } from "@/lib/export/pdf-exporter";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limiter";
import { isValidUuid, sanitizeFilenamePart } from "@/lib/security/validation";
import type { RemediationResult } from "@/lib/ai/types";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 1. Enforce rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(
    `export:${clientIp}`,
    RATE_LIMITS.EXPORT.maxRequests,
    RATE_LIMITS.EXPORT.windowMs
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too Many Requests. Report export rate limit exceeded.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: rateLimitResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimitResult.retryAfterSeconds.toString(),
        },
      }
    );
  }

  // 2. Resolve and validate route parameter
  const { id: scanId } = await context.params;

  if (!scanId || typeof scanId !== "string" || scanId.length > 100) {
    return NextResponse.json(
      { error: "Invalid or missing scan ID parameter." },
      { status: 400 }
    );
  }

  if (!isValidUuid(scanId)) {
    return NextResponse.json(
      { error: `Scan report with ID '${scanId}' not found.` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").toLowerCase();

  if (format !== "json" && format !== "csv" && format !== "pdf") {
    return NextResponse.json(
      { error: "Unsupported export format. Supported formats are 'json', 'csv', and 'pdf'." },
      { status: 400 }
    );
  }

  const repository = new ScanRepository();
  const report = await repository.getFullScanReport(scanId);

  if (!report) {
    return NextResponse.json(
      { error: `Scan report with ID '${scanId}' not found.` },
      { status: 404 }
    );
  }

  // Collect stored remediation records for each violation
  const remediations: Record<string, RemediationResult> = {};
  if (report.violations) {
    for (const v of report.violations) {
      const rem = await repository.getRemediation(scanId, v.id);
      if (rem) {
        remediations[v.id] = rem;
      }
    }
  }

  const safeFilePrefix = `accessai-report-${sanitizeFilenamePart(scanId.slice(0, 8))}`;

  try {
    if (format === "csv") {
      const csv = generateScanCsv({ report, remediations });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilePrefix}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "pdf") {
      const pdfBuffer = await generateScanPdf({ report, remediations });
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeFilePrefix}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Default: JSON
    const jsonStr = generateScanJson({ report, remediations });
    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilePrefix}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Export generation error:", err);
    return NextResponse.json(
      { error: "Internal Server Error. Failed to generate report export." },
      { status: 500 }
    );
  }
}
