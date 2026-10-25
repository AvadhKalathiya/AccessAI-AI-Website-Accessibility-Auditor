import { NextRequest, NextResponse } from "next/server";
import { ScanRepository } from "@/lib/db/scan-repository";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limiter";

export const runtime = "nodejs";

/**
 * GET /api/analytics/summary
 * Returns aggregated scan statistics, severity distributions, and daily trends.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Enforce rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(
    `analytics:${clientIp}`,
    RATE_LIMITS.ANALYTICS.maxRequests,
    RATE_LIMITS.ANALYTICS.windowMs
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too Many Requests. Analytics rate limit exceeded.",
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

  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get("days");

  let days = 30;
  if (daysParam !== null) {
    const parsed = Number.parseInt(daysParam, 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 365) {
      days = parsed;
    } else {
      return NextResponse.json(
        { error: "Invalid 'days' parameter. Must be an integer between 0 and 365." },
        { status: 400 }
      );
    }
  }

  const repository = new ScanRepository();

  try {
    const analytics = await repository.getAnalyticsSummary(days);
    return NextResponse.json(analytics, { status: 200 });
  } catch (err) {
    console.error("Database error retrieving analytics summary:", err);
    return NextResponse.json(
      { error: "Internal Server Error. Failed to generate analytics summary." },
      { status: 500 }
    );
  }
}
