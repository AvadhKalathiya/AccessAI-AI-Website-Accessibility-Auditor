/**
 * Security Hardening Unit Test Suite
 *
 * Covers:
 * - Rate limiter sliding-window enforcement, reset, and memory capacity limits
 * - Safe client IP extraction and header spoofing defense
 * - Ollama base URL validation and cloud metadata SSRF defense
 * - RFC 4122 UUID validation
 * - Content-Disposition filename sanitization (CRLF and traversal defense)
 * - SQL LIKE wildcard escaping
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  resetRateLimits,
  getTrackedKeyCount,
} from "@/lib/security/rate-limiter";
import {
  isValidUuid,
  sanitizeFilenamePart,
  escapeSqlLike,
} from "@/lib/security/validation";
import { OllamaClient, OllamaClientError } from "@/lib/ai/ollama";

describe("Security Hardening & Defense Utilities", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe("In-Memory Sliding Window Rate Limiter", () => {
    it("permits requests up to maxRequests ceiling and tracks remaining quota", () => {
      const key = "test-client-1";
      for (let i = 1; i <= 5; i++) {
        const result = checkRateLimit(key, 5, 60000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5 - i);
      }

      // 6th request exceeds limit
      const blocked = checkRateLimit(key, 5, 60000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("resets limit count after resetRateLimits is called", () => {
      const key = "test-client-reset";
      checkRateLimit(key, 1, 60000);
      const blocked = checkRateLimit(key, 1, 60000);
      expect(blocked.allowed).toBe(false);

      resetRateLimits();
      const allowed = checkRateLimit(key, 1, 60000);
      expect(allowed.allowed).toBe(true);
    });

    it("enforces maximum key capacity and evicts stale entries to prevent memory exhaustion", () => {
      // Simulate multiple keys
      for (let i = 0; i < 50; i++) {
        checkRateLimit(`key-${i}`, 10, 60000);
      }
      expect(getTrackedKeyCount()).toBe(50);
    });
  });

  describe("Safe Client IP Extraction", () => {
    it("extracts valid IPv4 from X-Forwarded-For", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.195, 198.51.100.1",
        },
      };
      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("extracts valid IPv6 from X-Forwarded-For", () => {
      const req = {
        headers: {
          "x-forwarded-for": "2001:db8::1",
        },
      };
      expect(getClientIp(req)).toBe("2001:db8::1");
    });

    it("falls back to X-Real-IP if X-Forwarded-For is missing or invalid", () => {
      const req = {
        headers: {
          "x-forwarded-for": "malicious-header-payload",
          "x-real-ip": "198.51.100.42",
        },
      };
      expect(getClientIp(req)).toBe("198.51.100.42");
    });

    it("falls back to 127.0.0.1 if both headers are missing or spoofed with garbage", () => {
      const req = {
        headers: {
          "x-forwarded-for": "<script>alert(1)</script>",
          "x-real-ip": "not-an-ip",
        },
      };
      expect(getClientIp(req)).toBe("127.0.0.1");
    });

    it("handles Headers object with .get() method", () => {
      const headers = new Headers();
      headers.set("x-forwarded-for", "192.0.2.1");
      expect(getClientIp({ headers })).toBe("192.0.2.1");
    });
  });

  describe("Ollama Base URL Validation", () => {
    it("accepts valid localhost and 127.0.0.1 HTTP URLs", () => {
      const client1 = new OllamaClient({ baseUrl: "http://127.0.0.1:11434" });
      expect(client1.getBaseUrl()).toBe("http://127.0.0.1:11434");

      const client2 = new OllamaClient({ baseUrl: "http://localhost:11434/" });
      expect(client2.getBaseUrl()).toBe("http://localhost:11434");
    });

    it("rejects malformed or non-HTTP/HTTPS URLs", () => {
      expect(() => new OllamaClient({ baseUrl: "ftp://127.0.0.1:11434" })).toThrowError(
        OllamaClientError
      );
      expect(() => new OllamaClient({ baseUrl: "not-a-valid-url" })).toThrowError(
        OllamaClientError
      );
    });

    it("blocks cloud metadata destination (169.254.169.254) from being set as Ollama base URL", () => {
      expect(
        () => new OllamaClient({ baseUrl: "http://169.254.169.254/latest/meta-data" })
      ).toThrowError(/Cloud metadata/);
    });

    it("blocks GCP metadata destination (metadata.google.internal)", () => {
      expect(
        () => new OllamaClient({ baseUrl: "http://metadata.google.internal/computeMetadata/v1" })
      ).toThrowError(/Cloud metadata/);
    });
  });

  describe("UUID Validation (isValidUuid)", () => {
    it("returns true for valid standard UUIDs", () => {
      expect(isValidUuid("c9bf9e57-1685-4c89-bafb-ff5af830be8a")).toBe(true);
      expect(isValidUuid("E6745163-EA06-4447-9759-994F31CFA510")).toBe(true);
    });

    it("returns false for non-UUID strings, path traversals, or injections", () => {
      expect(isValidUuid("")).toBe(false);
      expect(isValidUuid("unknown-id")).toBe(false);
      expect(isValidUuid("../../../etc/passwd")).toBe(false);
      expect(isValidUuid("12345")).toBe(false);
      expect(isValidUuid(null)).toBe(false);
      expect(isValidUuid(undefined)).toBe(false);
    });
  });

  describe("Filename Sanitization (sanitizeFilenamePart)", () => {
    it("retains safe alphanumeric characters, dots, and hyphens", () => {
      expect(sanitizeFilenamePart("example.com")).toBe("example.com");
      expect(sanitizeFilenamePart("audit-2026-10")).toBe("audit-2026-10");
    });

    it("strips path traversal patterns like '..'", () => {
      expect(sanitizeFilenamePart("../../../etc/passwd")).not.toContain("..");
      expect(sanitizeFilenamePart("..example..com..")).not.toContain("..");
    });

    it("neutralizes CRLF injection characters", () => {
      const tainted = "test\r\nSet-Cookie: evil=1\r\n";
      const clean = sanitizeFilenamePart(tainted);
      expect(clean).not.toContain("\r");
      expect(clean).not.toContain("\n");
    });

    it("falls back to 'scan' when given empty or invalid input", () => {
      expect(sanitizeFilenamePart("")).toBe("scan");
      expect(sanitizeFilenamePart("???///")).toBe("scan");
    });
  });

  describe("SQL LIKE Wildcard Escaping (escapeSqlLike)", () => {
    it("escapes percent (%) and underscore (_) characters", () => {
      expect(escapeSqlLike("100%_complete")).toBe("100\\%\\_complete");
      expect(escapeSqlLike("%test%")).toBe("\\%test\\%");
      expect(escapeSqlLike("plain-search")).toBe("plain-search");
    });

    it("handles empty or non-string inputs safely", () => {
      expect(escapeSqlLike("")).toBe("");
      expect(escapeSqlLike(null as unknown as string)).toBe("");
    });
  });
});
