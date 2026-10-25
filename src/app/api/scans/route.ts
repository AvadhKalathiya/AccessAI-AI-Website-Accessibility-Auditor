/**
 * /api/scans — Scan Collection API Route Handler
 *
 * POST: Validates target URL against SSRF policy, creates persistent queued scan,
 *       dispatches scan to job runner, and returns HTTP 202 Accepted.
 * GET:  Returns paginated scan history with metrics summaries.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateScanTargetUrl, SsrfError } from "@/lib/security/ssrf";
import { ScanRepository } from "@/lib/db/scan-repository";
import { getScanJobRunner } from "@/lib/scanner/scan-job-runner";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limiter";
import type { DbScanStatus } from "@/lib/db/schema";

export const runtime = "nodejs";

const CreateScanSchema = z.object({
  url: z.string().min(1, "URL cannot be empty."),
});

/**
 * POST /api/scans
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Enforce rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(
    `scan-submit:${clientIp}`,
    RATE_LIMITS.SCAN_SUBMIT.maxRequests,
    RATE_LIMITS.SCAN_SUBMIT.windowMs
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too Many Requests. Scan submission rate limit exceeded.",
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

  // 2. Verify JSON Content-Type
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Unsupported Media Type. Content-Type must be application/json." },
      { status: 415 }
    );
  }

  // 2. Parse and validate body
  let body: unknown;
  try {
    const text = await request.text();
    // Enforce 16KB payload cap
    if (text.length > 16384) {
      return NextResponse.json(
        { error: "Payload Too Large. Request body exceeds 16KB limit." },
        { status: 413 }
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Bad Request. Malformed or invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = CreateScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request body." },
      { status: 400 }
    );
  }

  const rawUrl = parsed.data.url;

  // 3. Pre-validate URL and check SSRF boundaries before accepting
  let validatedTarget;
  try {
    validatedTarget = await validateScanTargetUrl(rawUrl);
  } catch (err) {
    if (err instanceof SsrfError) {
      const statusCode = err.code === "URL_SANITIZATION_FAILED" ? 400 : 403;
      return NextResponse.json(
        {
          error: err.clientMessage,
          code: err.code,
        },
        { status: statusCode }
      );
    }
    return NextResponse.json(
      { error: "Invalid target URL." },
      { status: 400 }
    );
  }

  const normalizedUrl = validatedTarget.normalizedUrl;
  const repository = new ScanRepository();

  // 4. Check for active duplicate scan within debounce window (10s)
  const recentScan = await repository.findRecentActiveScan(normalizedUrl, 10);
  if (recentScan) {
    return NextResponse.json(
      {
        id: recentScan.id,
        status: recentScan.status,
        targetUrl: normalizedUrl,
        message: "An identical scan is already in progress. Reusing existing scan job.",
        reportUrl: `/api/scans/${recentScan.id}`,
        progressUrl: `/api/scans/${recentScan.id}/progress`,
        viewUrl: `/scans/${recentScan.id}`,
      },
      { status: 200 }
    );
  }

  const runner = getScanJobRunner();

  // 5. Check in-process queue capacity
  const stats = runner.getQueueStats();
  if (stats.waitingCount >= stats.maxQueueSize) {
    return NextResponse.json(
      {
        error: "Scanner is temporarily overloaded. Please try again in a few moments.",
        code: "QUEUE_CAPACITY_EXCEEDED",
      },
      { status: 503 }
    );
  }

  // 5. Create queued record in database
  let scanId: string;
  try {
    const created = await repository.createQueuedScan({
      submittedUrl: rawUrl,
      normalizedUrl,
    });
    scanId = created.id;
  } catch (err) {
    console.error("Database error creating scan:", err);
    return NextResponse.json(
      { error: "Internal Server Error. Failed to initialize scan record." },
      { status: 500 }
    );
  }

  // 6. Enqueue scan in background job runner
  try {
    await runner.enqueue(scanId, normalizedUrl);
  } catch (err) {
    console.error("Failed to enqueue scan job:", err);
    await repository.recordFailure(scanId, {
      code: "INTERNAL_ERROR",
      clientMessage: "Scanner queue error.",
    });
    return NextResponse.json(
      { error: "Failed to schedule scan." },
      { status: 500 }
    );
  }

  // 7. Return HTTP 202 Accepted
  return NextResponse.json(
    {
      id: scanId,
      status: "queued",
      targetUrl: normalizedUrl,
      message: "Scan job accepted and queued for auditing.",
      reportUrl: `/api/scans/${scanId}`,
      progressUrl: `/api/scans/${scanId}/progress`,
      viewUrl: `/scans/${scanId}`,
    },
    { status: 202 }
  );
}

/**
 * GET /api/scans
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const searchParam = searchParams.get("search") || undefined;
  const sortByParam = searchParams.get("sortBy") as
    | "newest"
    | "oldest"
    | "score"
    | "violations"
    | "duration"
    | null;
  const sortDirectionParam = searchParams.get("sortDirection") as
    | "asc"
    | "desc"
    | null;
  const statusParam = searchParams.get("status") as
    | DbScanStatus
    | "in_progress"
    | null;
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 10;
  const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

  if (Number.isNaN(limit) || Number.isNaN(offset) || limit < 1 || offset < 0) {
    return NextResponse.json(
      { error: "Invalid pagination parameters." },
      { status: 400 }
    );
  }

  const repository = new ScanRepository();
  try {
    const result = await repository.listScans({
      limit,
      offset,
      status: statusParam || undefined,
      search: searchParam,
      sortBy: sortByParam || undefined,
      sortDirection: sortDirectionParam || undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("Database error listing scans:", err);
    return NextResponse.json(
      { error: "Internal Server Error. Failed to retrieve scan history." },
      { status: 500 }
    );
  }
}
