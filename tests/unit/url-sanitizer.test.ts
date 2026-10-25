import { describe, it, expect } from "vitest";
import {
  sanitizeScanUrl,
  UrlSanitizerError,
} from "@/lib/security/url-sanitizer";

describe("URL Sanitizer & Structural Validation", () => {
  describe("Valid Public URLs", () => {
    it("accepts a standard HTTPS URL", () => {
      const result = sanitizeScanUrl("https://example.com");
      expect(result.normalizedUrl).toBe("https://example.com/");
      expect(result.hostname).toBe("example.com");
      expect(result.protocol).toBe("https:");
      expect(result.port).toBe(443);
      expect(result.isIpLiteral).toBe(false);
    });

    it("accepts a standard HTTP URL", () => {
      const result = sanitizeScanUrl("http://example.org/path?query=1#hash");
      expect(result.normalizedUrl).toBe("http://example.org/path?query=1#hash");
      expect(result.hostname).toBe("example.org");
      expect(result.protocol).toBe("http:");
      expect(result.port).toBe(80);
      expect(result.isIpLiteral).toBe(false);
    });

    it("normalizes uppercase hostnames to lowercase", () => {
      const result = sanitizeScanUrl("HTTPS://WWW.ACCESSAI.DEV/AUDIT");
      expect(result.hostname).toBe("www.accessai.dev");
      expect(result.protocol).toBe("https:");
    });

    it("strips trailing root dots from FQDN hostnames", () => {
      const result = sanitizeScanUrl("https://example.com./test");
      expect(result.hostname).toBe("example.com");
    });

    it("accepts explicit standard ports matching their protocol", () => {
      const httpResult = sanitizeScanUrl("http://example.com:80/home");
      expect(httpResult.port).toBe(80);
      expect(httpResult.normalizedUrl).toBe("http://example.com/home");

      const httpsResult = sanitizeScanUrl("https://example.com:443/secure");
      expect(httpsResult.port).toBe(443);
      expect(httpsResult.normalizedUrl).toBe("https://example.com/secure");
    });

    it("identifies IPv4 literals correctly", () => {
      const result = sanitizeScanUrl("https://93.184.216.34/");
      expect(result.isIpLiteral).toBe(true);
      expect(result.hostname).toBe("93.184.216.34");
    });

    it("identifies bracketed IPv6 literals correctly", () => {
      const result = sanitizeScanUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/");
      expect(result.isIpLiteral).toBe(true);
      expect(result.hostname).toBe("2606:2800:220:1:248:1893:25c8:1946");
    });
  });

  describe("Invalid Types & Malformed Inputs", () => {
    it("rejects non-string values", () => {
      expect(() => sanitizeScanUrl(null)).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl(undefined)).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl(12345)).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl({})).toThrow(UrlSanitizerError);
    });

    it("rejects empty or whitespace-only inputs", () => {
      expect(() => sanitizeScanUrl("")).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl("   \t  \n ")).toThrow(UrlSanitizerError);
    });

    it("rejects excessively long URLs (> 2048 chars)", () => {
      const hugeUrl = "https://example.com/" + "a".repeat(2050);
      expect(() => sanitizeScanUrl(hugeUrl)).toThrow(UrlSanitizerError);
    });

    it("rejects completely malformed URL strings", () => {
      expect(() => sanitizeScanUrl("not-a-valid-url")).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl("://missing-scheme")).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl("https://")).toThrow(UrlSanitizerError);
    });
  });

  describe("Protocol & Scheme Enforcement", () => {
    it("rejects file: protocol", () => {
      expect(() => sanitizeScanUrl("file:///etc/passwd")).toThrowError(/protocols are supported/);
    });

    it("rejects data: protocol", () => {
      expect(() => sanitizeScanUrl("data:text/html,<h1>test</h1>")).toThrowError(/protocols are supported/);
    });

    it("rejects javascript: protocol", () => {
      expect(() => sanitizeScanUrl("javascript:alert(1)")).toThrowError(/protocols are supported/);
    });

    it("rejects ftp: and gopher: protocols", () => {
      expect(() => sanitizeScanUrl("ftp://ftp.example.com/file")).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl("gopher://gopher.floodgap.com")).toThrow(UrlSanitizerError);
    });
  });

  describe("Credentials & Port Restrictions", () => {
    it("rejects embedded authentication credentials", () => {
      expect(() => sanitizeScanUrl("https://user:password@example.com")).toThrowError(/credentials/i);
      expect(() => sanitizeScanUrl("https://admin@example.com")).toThrowError(/credentials/i);
    });

    it("rejects non-standard ports", () => {
      expect(() => sanitizeScanUrl("https://example.com:8080")).toThrowError(/Non-standard ports/i);
      expect(() => sanitizeScanUrl("http://example.com:3000")).toThrowError(/Non-standard ports/i);
      expect(() => sanitizeScanUrl("https://example.com:22")).toThrowError(/Non-standard ports/i);
    });

    it("rejects mismatched protocol-port pairs (HTTP on 443 or HTTPS on 80)", () => {
      expect(() => sanitizeScanUrl("http://example.com:443")).toThrowError(/Non-standard ports/i);
      expect(() => sanitizeScanUrl("https://example.com:80")).toThrowError(/Non-standard ports/i);
    });
  });

  describe("Localhost & Reserved Domain Rejection", () => {
    it("rejects exact localhost", () => {
      expect(() => sanitizeScanUrl("http://localhost")).toThrowError(/Localhost destinations are strictly prohibited/i);
      expect(() => sanitizeScanUrl("https://localhost/api")).toThrowError(/Localhost destinations are strictly prohibited/i);
    });

    it("rejects subdomains of localhost", () => {
      expect(() => sanitizeScanUrl("http://sub.localhost")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("http://app.internal.localhost")).toThrowError(/prohibited/i);
    });

    it("rejects reserved local and test suffixes (.local, .internal, .lan, .test, .example)", () => {
      expect(() => sanitizeScanUrl("http://myrouter.local")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("https://kubernetes.default.svc.cluster.local")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("http://gateway.lan")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("http://service.internal")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("http://device.home.arpa")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("https://staging.test")).toThrowError(/prohibited/i);
      expect(() => sanitizeScanUrl("https://mock.example")).toThrowError(/prohibited/i);
    });

    it("rejects hostnames with invalid characters", () => {
      expect(() => sanitizeScanUrl("https://invalid_host_name.com")).toThrow(UrlSanitizerError);
      expect(() => sanitizeScanUrl("https://test..com")).toThrow(UrlSanitizerError);
    });
  });
});
