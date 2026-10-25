/**
 * Security Headers Configuration Test Suite
 *
 * Verifies that Next.js is configured with standard security headers:
 * - Content-Security-Policy
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy
 */

import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("Next.js Security Headers Configuration", () => {
  it("defines global headers matching all routes (/:path*)", async () => {
    expect(nextConfig.headers).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");

    const headerConfigs = await nextConfig.headers!();
    expect(Array.isArray(headerConfigs)).toBe(true);

    const globalRoute = headerConfigs.find((h) => h.source === "/:path*");
    expect(globalRoute).toBeDefined();

    const headersMap = new Map<string, string>();
    for (const h of globalRoute!.headers) {
      headersMap.set(h.key.toLowerCase(), h.value);
    }

    // 1. X-Content-Type-Options
    expect(headersMap.get("x-content-type-options")).toBe("nosniff");

    // 2. X-Frame-Options (Clickjacking defense)
    expect(headersMap.get("x-frame-options")).toBe("DENY");

    // 3. Referrer-Policy
    expect(headersMap.get("referrer-policy")).toBe("strict-origin-when-cross-origin");

    // 4. Permissions-Policy
    expect(headersMap.get("permissions-policy")).toContain("camera=()");
    expect(headersMap.get("permissions-policy")).toContain("microphone=()");
    expect(headersMap.get("permissions-policy")).toContain("geolocation=()");

    // 5. Content-Security-Policy
    const csp = headersMap.get("content-security-policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
