import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import net from "node:net";
import { createOutboundSecurityProxy } from "@/lib/scanner/outbound-proxy";
import type { DnsLookupFunction } from "@/lib/security/ssrf";

describe("Outbound Security Proxy & Network Boundary", () => {
  it("binds to loopback 127.0.0.1 on an ephemeral port", async () => {
    const proxy = await createOutboundSecurityProxy();
    try {
      expect(proxy.port).toBeGreaterThan(0);
      expect(proxy.serverUrl).toBe(`http://127.0.0.1:${proxy.port}`);
      expect(proxy.proxyUsername).toBe("accessai-scanner");
      expect(proxy.proxyPassword).toBeDefined();
    } finally {
      await proxy.close();
    }
  });

  it("rejects unauthenticated requests with 407 Proxy Authentication Required", async () => {
    const proxy = await createOutboundSecurityProxy();
    try {
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${proxy.port}`,
          {
            method: "GET",
            headers: {
              Host: "example.com",
            },
          },
          resolve
        );
        req.on("error", reject);
        req.end();
      });

      expect(res.statusCode).toBe(407);
      expect(res.headers["proxy-authenticate"]).toContain("AccessAI Scanner Proxy");
    } finally {
      await proxy.close();
    }
  });

  it("blocks non-standard destination ports (e.g. port 8080 or 22)", async () => {
    const proxy = await createOutboundSecurityProxy();
    try {
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${proxy.port}`,
          {
            method: "GET",
            headers: {
              Host: "example.com:8080",
              "Proxy-Authorization": proxy.proxyAuthHeader,
            },
          },
          resolve
        );
        req.on("error", reject);
        req.end();
      });

      expect(res.statusCode).toBe(400); // Malformed request or blocked
    } finally {
      await proxy.close();
    }
  });

  it("blocks CONNECT tunnels to internal IP literals (e.g. 127.0.0.1:443)", async () => {
    const proxy = await createOutboundSecurityProxy();
    try {
      const client = net.connect({ port: proxy.port, host: "127.0.0.1" }, () => {
        client.write(
          `CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\nProxy-Authorization: ${proxy.proxyAuthHeader}\r\n\r\n`
        );
      });

      const response = await new Promise<string>((resolve) => {
        client.on("data", (data) => {
          resolve(data.toString());
          client.destroy();
        });
      });

      expect(response).toContain("403 Forbidden");
    } finally {
      await proxy.close();
    }
  });

  it("blocks CONNECT tunnels to hostnames resolving to private IPs (SSRF DNS defense)", async () => {
    const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
      { address: "169.254.169.254", family: 4 }, // AWS metadata
    ]);

    const proxy = await createOutboundSecurityProxy({ dnsLookup: mockDns });
    try {
      const client = net.connect({ port: proxy.port, host: "127.0.0.1" }, () => {
        client.write(
          `CONNECT metadata-proxy.com:443 HTTP/1.1\r\nHost: metadata-proxy.com:443\r\nProxy-Authorization: ${proxy.proxyAuthHeader}\r\n\r\n`
        );
      });

      const response = await new Promise<string>((resolve) => {
        client.on("data", (data) => {
          resolve(data.toString());
          client.destroy();
        });
      });

      expect(response).toContain("403 Forbidden");
      expect(response).toContain("restricted");
    } finally {
      await proxy.close();
    }
  });

  it("blocks CONNECT tunnels when DNS resolves to mixed public and private addresses", async () => {
    const mockDns: DnsLookupFunction = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 }, // Private address in multi-A response
    ]);

    const proxy = await createOutboundSecurityProxy({ dnsLookup: mockDns });
    try {
      const client = net.connect({ port: proxy.port, host: "127.0.0.1" }, () => {
        client.write(
          `CONNECT dual-homed-attack.com:443 HTTP/1.1\r\nHost: dual-homed-attack.com:443\r\nProxy-Authorization: ${proxy.proxyAuthHeader}\r\n\r\n`
        );
      });

      const response = await new Promise<string>((resolve) => {
        client.on("data", (data) => {
          resolve(data.toString());
          client.destroy();
        });
      });

      expect(response).toContain("403 Forbidden");
    } finally {
      await proxy.close();
    }
  });

  it("blocks forbidden local domain suffixes (.local, .internal, .lan)", async () => {
    const proxy = await createOutboundSecurityProxy();
    try {
      const client = net.connect({ port: proxy.port, host: "127.0.0.1" }, () => {
        client.write(
          `CONNECT router.local:443 HTTP/1.1\r\nHost: router.local:443\r\nProxy-Authorization: ${proxy.proxyAuthHeader}\r\n\r\n`
        );
      });

      const response = await new Promise<string>((resolve) => {
        client.on("data", (data) => {
          resolve(data.toString());
          client.destroy();
        });
      });

      expect(response).toContain("403 Forbidden");
      expect(response).toContain("Forbidden internal domain");
    } finally {
      await proxy.close();
    }
  });
});
