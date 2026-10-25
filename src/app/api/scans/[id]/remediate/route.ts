import { NextRequest, NextResponse } from "next/server";
import { RemediateRequestBodySchema } from "@/lib/ai/schemas";
import {
  RemediationService,
  RemediationServiceError,
} from "@/lib/ai/remediation-service";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/security/rate-limiter";
import { isValidUuid } from "@/lib/security/validation";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 1. Resolve route parameters
  const { id: scanId } = await context.params;

  if (!scanId || typeof scanId !== "string" || scanId.length > 100) {
    return NextResponse.json(
      { error: "Invalid or missing scan ID parameter." },
      { status: 400 }
    );
  }

  if (!isValidUuid(scanId)) {
    return NextResponse.json(
      { error: "Scan record not found." },
      { status: 404 }
    );
  }

  // 2. Validate Content-Type
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Unsupported Media Type. Content-Type must be application/json." },
      { status: 415 }
    );
  }

  // 3. Enforce bounded payload size (< 16KB)
  let bodyText: string;
  try {
    bodyText = await request.text();
    if (bodyText.length > 16384) {
      return NextResponse.json(
        { error: "Payload Too Large. Request body exceeds 16KB limit." },
        { status: 413 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body." },
      { status: 400 }
    );
  }

  // 4. Parse JSON
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json(
      { error: "Bad Request. Malformed or invalid JSON body." },
      { status: 400 }
    );
  }

  // 5. Validate schema
  const parsed = RemediateRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg =
      parsed.error.issues[0]?.message || "Invalid request parameters.";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const { violationId, regenerate } = parsed.data;
  if (!isValidUuid(violationId)) {
    return NextResponse.json(
      { error: "Violation not found." },
      { status: 404 }
    );
  }

  // 6. Apply rate limiting (e.g. 30 requests per minute per IP / scan)
  const clientIp = getClientIp(request);
  const rateLimitKey = `remediate:${clientIp}:${scanId}`;
  const rateCheck = checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.REMEDIATE.maxRequests,
    RATE_LIMITS.REMEDIATE.windowMs
  );

  if (!rateCheck.allowed) {
    const retryAfterSec = rateCheck.retryAfterSeconds;
    return NextResponse.json(
      {
        error: "Too Many Requests. Rate limit exceeded for remediation requests.",
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  }

  // 7. Invoke remediation service
  try {
    const service = new RemediationService();
    const remediation = await service.getOrGenerateRemediation({
      scanId,
      violationId,
      regenerate,
    });

    return NextResponse.json({ remediation }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof RemediationServiceError) {
      if (err.code === "SCAN_NOT_FOUND") {
        return NextResponse.json(
          { error: "Scan record not found." },
          { status: 404 }
        );
      }
      if (err.code === "VIOLATION_NOT_FOUND" || err.code === "MISMATCH") {
        return NextResponse.json(
          { error: "Violation not found or does not belong to this scan." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal Server Error. Failed to process remediation." },
      { status: 500 }
    );
  }
}
