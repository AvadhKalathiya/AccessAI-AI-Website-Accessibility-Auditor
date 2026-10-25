import { describe, it, expect, vi } from "vitest";
import {
  classifyIpAddress,
  validateScanTargetUrl,
  SsrfError,
  type DnsLookupFunction,
} from "@/lib/security/ssrf";

describe("SSRF & IP Address Classification", () => {
  describe("Pure IP Classification (Public vs Private)", () => {
    it("classifies legitimate public IPv4 unicast addresses as public", () => {
      expect(classifyIpAddress("8.8.8.8").isPublic).toBe(true);
      expect(classifyIpAddress("1.1.1.1").isPublic).toBe(true);
      expect(classifyIpAddress("93.184.216.34").isPublic).toBe(true);
    });

    it("classifies legitimate public IPv6 unicast addresses as public", () => {
      expect(classifyIpAddress("2606:2800:220:1:248:1893:25c8:1946").isPublic).toBe(true);
      expect(classifyIpAddress("2001:4860:4860::8888").isPublic).toBe(true);
    });

    it("rejects IPv4 loopback (127.0.0.1, 127.0.0.0/8)", () => {
      expect(classifyIpAddress("127.0.0.1").isPublic).toBe(false);
      expect(classifyIpAddress("127.0.0.50").isPublic).toBe(false);
      expect(classifyIpAddress("127.255.255.254").isPublic).toBe(false);
    });

    it("rejects RFC 1918 private IPv4 networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", () => {
      expect(classifyIpAddress("10.0.0.1").isPublic).toBe(false);
      expect(classifyIpAddress("10.254.1.1").isPublic).toBe(false);
      expect(classifyIpAddress("172.16.0.1").isPublic).toBe(false);
      expect(classifyIpAddress("172.31.255.254").isPublic).toBe(false);
      expect(classifyIpAddress("192.168.1.1").isPublic).toBe(false);
      expect(classifyIpAddress("192.168.0.254").isPublic).toBe(false);
    });

    it("rejects cloud metadata and link-local IPv4 (169.254.169.254, RFC 3927)", () => {
      const meta = classifyIpAddress("169.254.169.254");
      expect(meta.isPublic).toBe(false);
      expect(meta.range).toBe("linkLocal");
    });

    it("rejects carrier-grade NAT (100.64.0.0/10)", () => {
      const cgnat = classifyIpAddress("100.64.0.1");
      expect(cgnat.isPublic).toBe(false);
      expect(cgnat.range).toBe("carrierGradeNat");
    });

    it("rejects unspecified (0.0.0.0) and broadcast (255.255.255.255)", () => {
      expect(classifyIpAddress("0.0.0.0").isPublic).toBe(false);
      expect(classifyIpAddress("255.255.255.255").isPublic).toBe(false);
    });

    it("rejects IPv4 multicast (224.0.0.0/4)", () => {
      expect(classifyIpAddress("224.0.0.1").isPublic).toBe(false);
      expect(classifyIpAddress("239.255.255.250").isPublic).toBe(false);
    });

    it("rejects IPv6 loopback (::1) and unspecified (::)", () => {
      expect(classifyIpAddress("::1").isPublic).toBe(false);
      expect(classifyIpAddress("::").isPublic).toBe(false);
    });

    it("rejects IPv6 unique-local (fc00::/7) and link-local (fe80::/10)", () => {
      expect(classifyIpAddress("fc00::1").isPublic).toBe(false);
      expect(classifyIpAddress("fd00::1234").isPublic).toBe(false);
      expect(classifyIpAddress("fe80::1").isPublic).toBe(false);
      expect(classifyIpAddress("fe80::200:5efe:10.0.0.1").isPublic).toBe(false);
    });

    it("rejects IPv4-mapped IPv6 representations of private and loopback addresses", () => {
      const mappedLoopback = classifyIpAddress("::ffff:127.0.0.1");
      expect(mappedLoopback.isPublic).toBe(false);
      expect(mappedLoopback.range).toContain("loopback");

      const mappedPrivate = classifyIpAddress("::ffff:10.0.0.1");
      expect(mappedPrivate.isPublic).toBe(false);

      const mappedMeta = classifyIpAddress("::ffff:169.254.169.254");
      expect(mappedMeta.isPublic).toBe(false);

      // Verify that public IPv4 mapped to IPv6 is accepted
      const mappedPublic = classifyIpAddress("::ffff:8.8.8.8");
      expect(mappedPublic.isPublic).toBe(true);
    });

    it("evaluates RFC 6052 NAT64 IPv4-translated IPv6 addresses against IPv4 rules", () => {
      // Loopback inside RFC 6052 (127.0.0.1)
      const nat64Loopback = classifyIpAddress("64:ff9b::7f00:1");
      expect(nat64Loopback.isPublic).toBe(false);
      expect(nat64Loopback.range).toBe("rfc6052(loopback)");

      // Private network inside RFC 6052 (10.0.0.1)
      const nat64Private = classifyIpAddress("64:ff9b::a00:1");
      expect(nat64Private.isPublic).toBe(false);
      expect(nat64Private.range).toBe("rfc6052(private)");

      // Cloud metadata inside RFC 6052 (169.254.169.254)
      const nat64Meta = classifyIpAddress("64:ff9b::a9fe:a9fe");
      expect(nat64Meta.isPublic).toBe(false);
      expect(nat64Meta.range).toBe("rfc6052(linkLocal)");

      // Legitimate public unicast inside RFC 6052 (216.198.79.1)
      const nat64Public = classifyIpAddress("64:ff9b::d8c6:4f01");
      expect(nat64Public.isPublic).toBe(true);
      expect(nat64Public.range).toBe("rfc6052(unicast)");
    });

    it("rejects malformed IP strings", () => {
      expect(classifyIpAddress("999.999.999.999").isPublic).toBe(false);
      expect(classifyIpAddress("1.2.3").isPublic).toBe(false);
      expect(classifyIpAddress("not-an-ip").isPublic).toBe(false);
    });
  });

  describe("Asynchronous DNS Validation (with Injected Resolvers)", () => {
    it("accepts a public hostname when DNS resolves exclusively to public IPs", async () => {
      const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]);

      const result = await validateScanTargetUrl("https://example.com", {
        dnsLookup: mockDns,
      });

      expect(result.normalizedUrl).toBe("https://example.com/");
      expect(result.resolvedIps).toEqual([
        "93.184.216.34",
        "2606:2800:220:1:248:1893:25c8:1946",
      ]);
      expect(mockDns).toHaveBeenCalledTimes(1);
    });

    it("evaluates public IP literals directly without invoking DNS lookup", async () => {
      const mockDns: DnsLookupFunction = vi.fn();

      const result = await validateScanTargetUrl("https://93.184.216.34", {
        dnsLookup: mockDns,
      });

      expect(result.normalizedUrl).toBe("https://93.184.216.34/");
      expect(result.resolvedIps).toEqual(["93.184.216.34"]);
      expect(mockDns).not.toHaveBeenCalled();
    });

    it("rejects private IP literals immediately without invoking DNS lookup", async () => {
      const mockDns: DnsLookupFunction = vi.fn();

      await expect(
        validateScanTargetUrl("http://127.0.0.1", { dnsLookup: mockDns })
      ).rejects.toThrow(SsrfError);

      await expect(
        validateScanTargetUrl("http://169.254.169.254", { dnsLookup: mockDns })
      ).rejects.toThrow(SsrfError);

      expect(mockDns).not.toHaveBeenCalled();
    });

    it("rejects hostname when DNS returns a private IPv4 address", async () => {
      const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
        { address: "192.168.1.1", family: 4 },
      ]);

      await expect(
        validateScanTargetUrl("https://internal-portal.com", { dnsLookup: mockDns })
      ).rejects.toThrowError(/private or restricted network address/i);
    });

    it("rejects hostname when DNS returns a loopback IPv6 address", async () => {
      const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
        { address: "::1", family: 6 },
      ]);

      await expect(
        validateScanTargetUrl("https://evil-rebind.com", { dnsLookup: mockDns })
      ).rejects.toThrowError(/private or restricted network address/i);
    });

    it("rejects hostname with mixed public and private IP results (fail closed)", async () => {
      const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 }, // Attacker trying to piggyback private IP
      ]);

      await expect(
        validateScanTargetUrl("https://mixed-results.com", { dnsLookup: mockDns })
      ).rejects.toThrowError(/private or restricted network address/i);
    });

    it("rejects when DNS returns empty results array", async () => {
      const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([]);

      await expect(
        validateScanTargetUrl("https://ghost-domain.com", { dnsLookup: mockDns })
      ).rejects.toThrowError(/no IP addresses/i);
    });

    it("rejects when DNS resolution encounters an error (NXDOMAIN / ENOTFOUND)", async () => {
      const mockDns: DnsLookupFunction = vi
        .fn()
        .mockRejectedValue(new Error("ENOTFOUND nonexistent.domain"));

      await expect(
        validateScanTargetUrl("https://nonexistent.domain", { dnsLookup: mockDns })
      ).rejects.toThrowError(/Unable to resolve/i);
    });

    it("enforces timeout and fails closed if DNS lookup hangs", async () => {
      const hangingDns: DnsLookupFunction = () =>
        new Promise((resolve) => setTimeout(resolve, 500));

      await expect(
        validateScanTargetUrl("https://slow-dns.com", {
          dnsLookup: hangingDns,
          timeoutMs: 50,
        })
      ).rejects.toThrowError(/timed out/i);
    });
  });
});
