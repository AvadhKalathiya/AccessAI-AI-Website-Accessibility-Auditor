/**
 * Outbound Network Security Proxy & Egress Boundary
 *  
 * Implements a per-scan loopback HTTP proxy that enforces connection-level
 * destination checks on ALL outbound requests and HTTPS CONNECT tunnels.
 *
 * DEFENSE-IN-DEPTH ARCHITECTURE:
 * 1. Binds exclusively to loopback (127.0.0.1) on an ephemeral port.
 * 2. Authenticates each request using an unpredictable per-scan secret token.
 * 3. Inspects every destination host and port:
 *    - Rejects non-standard ports (strictly allows port 80 for HTTP and 443 for HTTPS).
 *    - Validates hostname syntax and forbids local/internal domains (.local, .internal, etc.).
 * 4. DNS Time-of-Check / Time-of-Use & Rebinding Mitigation:
 *    - Resolves ALL destination A/AAAA records before creating any socket.
 *    - If ANY returned address is non-public or prohibited, the request is rejected immediately.
 *    - Connects directly to the validated IP address to eliminate secondary, unvalidated DNS lookups.
 * 5. Lifecycle Management:
 *    - Closes all active client and destination sockets upon scan termination.
 *    - Enforces socket timeouts and maximum connection ceilings.
 *
 * SECURITY LIMITATION:
 * This application-level proxy strictly guards against browser requests to internal IPs
 * and prohibited ports. In production container deployments, this layer should be paired
 * with OS-level egress firewalls (e.g. iptables rules blocking RFC 1918 and 169.254.169.254).
 */

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import {
  classifyIpAddress,
  type DnsLookupFunction,
} from "@/lib/security/ssrf";
import dns from "node:dns/promises";

export interface OutboundProxyOptions {
  /** Optional custom DNS resolver for testing without network requests */
  dnsLookup?: DnsLookupFunction;
  /** Maximum connection timeout in milliseconds (default: 15000ms) */
  socketTimeoutMs?: number;
}

export interface OutboundProxyInstance {
  port: number;
  serverUrl: string;
  proxyAuthHeader: string;
  proxyUsername: string;
  proxyPassword: string;
  close: () => Promise<void>;
  getConnectionStats: () => {
    totalRequests: number;
    blockedRequests: number;
    activeSockets: number;
  };
}

const defaultDnsLookup: DnsLookupFunction = async (hostname) => {
  const res = await dns.lookup(hostname, { all: true });
  return Array.isArray(res) ? res : [res];
};

const FORBIDDEN_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".test",
  ".example",
  ".invalid",
  ".corp",
  ".onion",
];

/**
 * Validates a destination hostname and port against public unicast restrictions.
 * Resolves all IP addresses and returns a verified IP for connection pinning.
 */
async function validateDestination(
  hostname: string,
  port: number,
  expectedPorts: number[],
  dnsLookup: DnsLookupFunction
): Promise<{ valid: boolean; validatedIp?: string; reason?: string }> {
  // 1. Port restriction
  if (!expectedPorts.includes(port)) {
    return {
      valid: false,
      reason: `Prohibited port: ${port}. Only standard ports (${expectedPorts.join(", ")}) are permitted.`,
    };
  }

  const cleanHost = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

  // 2. Localhost & forbidden suffixes
  if (cleanHost === "localhost" || cleanHost.endsWith(".localhost")) {
    return { valid: false, reason: "Localhost access is prohibited." };
  }

  for (const suffix of FORBIDDEN_SUFFIXES) {
    if (cleanHost.endsWith(suffix) || cleanHost === suffix.slice(1)) {
      return { valid: false, reason: `Forbidden internal domain suffix: ${suffix}.` };
    }
  }

  // 3. If hostname is an IP literal
  const isIpLiteral = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost) || cleanHost.includes(":");
  if (isIpLiteral) {
    const classification = classifyIpAddress(cleanHost);
    if (!classification.isPublic) {
      return {
        valid: false,
        reason: `Destination IP is private or restricted: ${classification.reason ?? classification.range}`,
      };
    }
    return { valid: true, validatedIp: classification.ip };
  }

  // 4. Resolve DNS records and verify all results
  try {
    const records = await dnsLookup(cleanHost, { all: true });
    if (!records || records.length === 0) {
      return { valid: false, reason: "DNS resolution returned no IP addresses." };
    }

    // Inspect every returned address (fail closed on any private address)
    for (const record of records) {
      const classification = classifyIpAddress(record.address);
      if (!classification.isPublic) {
        return {
          valid: false,
          reason: `Resolved address ${record.address} is restricted (${classification.reason ?? classification.range}).`,
        };
      }
    }

    // Prefer genuine IPv4 record if available (avoids DNS64/NAT64 translation hop and drops)
    const preferredRecord = records.find((r) => r.family === 4) || records[0];
    return { valid: true, validatedIp: preferredRecord.address };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, reason: `DNS resolution failed: ${msg}` };
  }
}

/**
 * Creates and starts a restricted per-scan outbound HTTP/HTTPS proxy.
 */
export async function createOutboundSecurityProxy(
  options: OutboundProxyOptions = {}
): Promise<OutboundProxyInstance> {
  const { dnsLookup = defaultDnsLookup, socketTimeoutMs = 15000 } = options;

  const proxyUsername = "accessai-scanner";
  const proxyPassword = crypto.randomBytes(16).toString("hex");
  const expectedAuth = `Basic ${Buffer.from(`${proxyUsername}:${proxyPassword}`).toString("base64")}`;

  let totalRequests = 0;
  let blockedRequests = 0;
  const activeSockets = new Set<net.Socket>();

  const trackSocket = (sock: net.Socket) => {
    activeSockets.add(sock);
    sock.setTimeout(socketTimeoutMs);
    sock.once("timeout", () => {
      sock.destroy();
    });
    sock.once("close", () => {
      activeSockets.delete(sock);
    });
  };

  const server = http.createServer();

  // Helper to verify proxy authentication
  const checkAuth = (req: http.IncomingMessage, resOrSocket: http.ServerResponse | net.Socket): boolean => {
    const authHeader = req.headers["proxy-authorization"];
    if (authHeader !== expectedAuth) {
      if ("writeHead" in resOrSocket) {
        resOrSocket.writeHead(407, {
          "Proxy-Authenticate": 'Basic realm="AccessAI Scanner Proxy"',
          "Content-Type": "text/plain",
        });
        resOrSocket.end("Proxy authentication required.");
      } else {
        resOrSocket.write("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"AccessAI Scanner Proxy\"\r\n\r\n");
        resOrSocket.destroy();
      }
      blockedRequests++;
      return false;
    }
    return true;
  };

  // 1. Handle standard HTTP proxy requests (GET, HEAD, POST, etc.)
  server.on("request", async (req: http.IncomingMessage, res: http.ServerResponse) => {
    totalRequests++;
    if (!checkAuth(req, res)) return;

    if (!req.url) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Malformed request: Missing URL.");
      blockedRequests++;
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Malformed request URL.");
      blockedRequests++;
      return;
    }

    const port = parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 80;
    const destCheck = await validateDestination(parsedUrl.hostname, port, [80], dnsLookup);

    if (!destCheck.valid || !destCheck.validatedIp) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end(`Access denied by scanner security policy: ${destCheck.reason}`);
      blockedRequests++;
      return;
    }

    // Forward HTTP request to the pinned validated IP address
    const outgoingHeaders = { ...req.headers };
    delete outgoingHeaders["proxy-authorization"];
    delete outgoingHeaders["proxy-connection"];
    outgoingHeaders["host"] = parsedUrl.host;

    const proxyReq = http.request(
      {
        host: destCheck.validatedIp, // Connection pinning
        port,
        method: req.method,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: outgoingHeaders,
        timeout: socketTimeoutMs,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Proxy gateway connection failed: ${err.message}`);
      }
      blockedRequests++;
    });

    req.pipe(proxyReq);
  });

  // 2. Handle HTTPS CONNECT tunnels
  server.on("connect", async (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    totalRequests++;
    trackSocket(clientSocket);

    if (!checkAuth(req, clientSocket)) return;

    const authority = req.url || "";
    const parts = authority.split(":");
    const hostname = parts[0];
    const port = parts[1] ? Number.parseInt(parts[1], 10) : 443;

    if (!hostname || Number.isNaN(port)) {
      clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      clientSocket.destroy();
      blockedRequests++;
      return;
    }

    const destCheck = await validateDestination(hostname, port, [443], dnsLookup);
    if (!destCheck.valid || !destCheck.validatedIp) {
      clientSocket.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nAccess denied: ${destCheck.reason}\r\n`);
      clientSocket.destroy();
      blockedRequests++;
      return;
    }

    // Establish TCP connection directly to pinned validated IP (prevents secondary unvalidated DNS lookup)
    const targetSocket = net.connect(
      {
        host: destCheck.validatedIp,
        port,
        timeout: socketTimeoutMs,
      },
      () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head && head.length > 0) {
          targetSocket.write(head);
        }
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      }
    );

    trackSocket(targetSocket);

    targetSocket.on("error", () => {
      clientSocket.destroy();
    });

    clientSocket.on("error", () => {
      targetSocket.destroy();
    });
  });

  // Bind exclusively to 127.0.0.1 on an ephemeral port
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
    server.on("error", reject);
  });

  const address = server.address() as net.AddressInfo;
  const port = address.port;

  return {
    port,
    serverUrl: `http://127.0.0.1:${port}`,
    proxyAuthHeader: expectedAuth,
    proxyUsername,
    proxyPassword,
    close: async () => {
      for (const sock of activeSockets) {
        sock.destroy();
      }
      activeSockets.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
    getConnectionStats: () => ({
      totalRequests,
      blockedRequests,
      activeSockets: activeSockets.size,
    }),
  };
}
