/**
 * API Security & Rate Limiting Integration Suite
 *
 * Verifies endpoint behavior under security boundary conditions:
 * - Rate limiting on POST /api/scans (429 with Retry-After)
 * - Duplicate active scan debounce on POST /api/scans
 * - Rate limiting on GET /api/scans/[id]/export
 * - Rate limiting on GET /api/analytics/summary
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as createScan } from "@/app/api/scans/route";
import { GET as exportReport } from "@/app/api/scans/[id]/export/route";
import { GET as getAnalytics } from "@/app/api/analytics/summary/route";
import { resetRateLimits } from "@/lib/security/rate-limiter";

describe("API Security & Rate Limiting Integration Suite", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("enforces rate limits on POST /api/scans and returns HTTP 429 with Retry-After header", async () => {
    const ip = "198.51.100.99";

    // Rate limit for scan-submit is 10 requests per minute
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost:3000/api/scans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ url: `https://example${i}.com` }),
      });
      const res = await createScan(req);
      expect(res.status).not.toBe(429);
    }

    // 11th request must be rejected with 429
    const blockedReq = new NextRequest("http://localhost:3000/api/scans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ url: "https://example-blocked.com" }),
    });

    const blockedRes = await createScan(blockedReq);
    expect(blockedRes.status).toBe(429);

    const retryAfter = blockedRes.headers.get("retry-after");
    expect(retryAfter).toBeDefined();
    expect(Number.parseInt(retryAfter!, 10)).toBeGreaterThan(0);

    const body = await blockedRes.json();
    expect(body.error).toContain("rate limit exceeded");
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("debounces rapid duplicate scan submissions within 10 seconds and reuses existing active scan", async () => {
    const targetUrl = "https://example.com";

    // 1st submission
    const req1 = new NextRequest("http://localhost:3000/api/scans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.88",
      },
      body: JSON.stringify({ url: targetUrl }),
    });
    const res1 = await createScan(req1);
    expect([200, 202]).toContain(res1.status);
    const body1 = await res1.json();
    const originalScanId = body1.id;

    // Immediate duplicate submission of identical URL
    const req2 = new NextRequest("http://localhost:3000/api/scans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.88",
      },
      body: JSON.stringify({ url: targetUrl }),
    });
    const res2 = await createScan(req2);
    expect(res2.status).toBe(200);

    const body2 = await res2.json();
    // Must return the exact same scan ID rather than creating a second job
    expect(body2.id).toBe(originalScanId);
    expect(body2.message).toContain("already in progress");
  });

  it("enforces rate limits on GET /api/scans/[id]/export", async () => {
    const ip = "198.51.100.77";
    const validUuid = "11111111-2222-3333-4444-555555555555";

    // Export rate limit is 20 requests per minute
    for (let i = 0; i < 20; i++) {
      const req = new NextRequest(`http://localhost:3000/api/scans/${validUuid}/export?format=json`, {
        headers: {
          "x-forwarded-for": ip,
        },
      });
      const res = await exportReport(req, { params: Promise.resolve({ id: validUuid }) });
      expect(res.status).not.toBe(429);
    }

    // 21st request triggers 429
    const blockedReq = new NextRequest(`http://localhost:3000/api/scans/${validUuid}/export?format=json`, {
      headers: {
        "x-forwarded-for": ip,
      },
    });
    const blockedRes = await exportReport(blockedReq, { params: Promise.resolve({ id: validUuid }) });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeDefined();
  });

  it("enforces rate limits on GET /api/analytics/summary", async () => {
    const ip = "198.51.100.66";

    // Analytics rate limit is 30 requests per minute
    for (let i = 0; i < 30; i++) {
      const req = new NextRequest("http://localhost:3000/api/analytics/summary", {
        headers: {
          "x-forwarded-for": ip,
        },
      });
      const res = await getAnalytics(req);
      expect(res.status).not.toBe(429);
    }

    // 31st request triggers 429
    const blockedReq = new NextRequest("http://localhost:3000/api/analytics/summary", {
      headers: {
        "x-forwarded-for": ip,
      },
    });
    const blockedRes = await getAnalytics(blockedReq);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("retry-after")).toBeDefined();
  });
});
