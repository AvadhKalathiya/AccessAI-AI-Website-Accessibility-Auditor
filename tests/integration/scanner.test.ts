import { describe, it, expect, vi } from "vitest";
import { scanWebsite } from "@/lib/scanner/scan-website";
import type { DnsLookupFunction } from "@/lib/security/ssrf";

describe("AccessAI Full Scanner Integration Suite", () => {
  it("rejects loopback and private IP targets immediately before launching browser", async () => {
    const result = await scanWebsite("http://127.0.0.1");
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe("BLOCKED_DESTINATION");
  });

  it("rejects non-standard ports before browser launch", async () => {
    const result = await scanWebsite("https://example.com:8443");
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_TARGET");
  });

  it("rejects local and test domain suffixes before browser launch", async () => {
    const result = await scanWebsite("http://internal-service.local");
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("INVALID_TARGET");
  });

  it("handles DNS lookup failures gracefully without crashing", async () => {
    const result = await scanWebsite("https://a-completely-nonexistent-domain-1234567.org");
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("BLOCKED_DESTINATION");
  });

  it("initializes telemetry, metadata, and timing accurately on failure", async () => {
    const result = await scanWebsite("http://192.168.1.1");
    expect(result.timing.startedAt).toBeDefined();
    expect(result.timing.finishedAt).toBeDefined();
    expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.browser).toContain("Chromium");
    expect(result.metadata.wcagStandardScope.length).toBeGreaterThan(0);
  });
});
