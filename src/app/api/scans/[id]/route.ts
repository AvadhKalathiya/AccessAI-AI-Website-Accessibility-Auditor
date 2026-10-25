/**
 * /api/scans/[id] — Single Scan Report Route Handler
 *
 * GET: Retrieves the full scan report including violations, affected DOM nodes, and metrics.
 */

import { NextRequest, NextResponse } from "next/server";
import { ScanRepository } from "@/lib/db/scan-repository";
import { isValidUuid } from "@/lib/security/validation";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (!id || id.trim().length === 0 || id.length > 100) {
    return NextResponse.json(
      { error: "Scan ID is required." },
      { status: 400 }
    );
  }

  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "Scan report not found.", scanId: id },
      { status: 404 }
    );
  }

  const repository = new ScanRepository();
  try {
    const report = await repository.getFullScanReport(id);

    if (!report) {
      return NextResponse.json(
        { error: "Scan report not found.", scanId: id },
        { status: 404 }
      );
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    console.error(`Database error fetching scan report ${id}:`, err);
    return NextResponse.json(
      { error: "Internal Server Error. Failed to retrieve scan report." },
      { status: 500 }
    );
  }
}
