/**
 * SSRF & IP Address Classification Module
 *
 * Implements a conservative public-unicast validation policy to defend against
 * Server-Side Request Forgery (SSRF), internal network probing, and cloud
 * metadata service exfiltration (e.g., AWS/GCP/Azure 169.254.169.254).
 *
 * SECURITY POLICY:
 * An IP address is deemed acceptable ONLY IF:
 * 1. It is a syntactically valid IPv4 or IPv6 address.
 * 2. If it is an IPv4-mapped IPv6 address (::ffff:x.x.x.x), it is extracted to its native IPv4
 *    form and re-evaluated under all IPv4 restrictions.
 * 3. It is positively classified as a standard, globally routable public unicast address.
 * 4. It does NOT belong to any loopback, private (RFC 1918), link-local (RFC 3927), carrier-grade NAT,
 *    multicast, broadcast, unspecified, transition/teredo/6to4, or reserved range.
 *
 * This policy follows a fail-closed principle. Any unrecognized range, parsing anomaly, or
 * DNS resolution ambiguity results in immediate rejection.
 */

import ipaddr from "ipaddr.js";
import dns from "node:dns/promises";
import {
  sanitizeScanUrl,
  UrlSanitizerError,
  type SanitizedUrlResult,
} from "./url-sanitizer";

export type SsrfErrorCode =
  | "INVALID_IP"
  | "FORBIDDEN_IP_RANGE"
  | "DNS_RESOLUTION_FAILED"
  | "DNS_EMPTY_RESULTS"
  | "DNS_TIMEOUT"
  | "URL_SANITIZATION_FAILED";

export class SsrfError extends Error {
  public readonly code: SsrfErrorCode;
  public readonly clientMessage: string;
  public readonly details?: string;

  constructor(code: SsrfErrorCode, clientMessage: string, details?: string) {
    // Set Error.message to clientMessage so standard toThrowError(/.../) matches clientMessage
    super(clientMessage);
    this.name = "SsrfError";
    this.code = code;
    this.clientMessage = clientMessage;
    this.details = details;
    Object.setPrototypeOf(this, SsrfError.prototype);
  }
}

export interface IpClassificationResult {
  ip: string;
  kind: "ipv4" | "ipv6";
  isPublic: boolean;
  range: string;
  reason?: string;
}

/**
 * Prohibited ranges for IPv4.
 * Only 'unicast' is accepted as globally routable public destination.
 */
const FORBIDDEN_IPV4_RANGES = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "carrierGradeNat",
  "private",
  "reserved",
  "as112",
]);

/**
 * Prohibited ranges for IPv6.
 * Note: 'ipv4Mapped' must be unmapped and checked against IPv4 rules.
 * Only standard 'unicast' (excluding transition or special-purpose ranges) is accepted.
 */
const FORBIDDEN_IPV6_RANGES = new Set([
  "unspecified",
  "linkLocal",
  "multicast",
  "loopback",
  "uniqueLocal",
  "deprecatedSiteLocal",
  "discard",
  "rfc6145",
  "6to4",
  "teredo",
  "benchmarking",
  "amt",
  "as112v6",
]);

/**
 * Pure function to classify an IP string and determine if it is an acceptable,
 * globally routable public unicast address.
 *
 * @param ipString Raw IP string (IPv4 or IPv6, with or without enclosing brackets)
 */
export function classifyIpAddress(ipString: string): IpClassificationResult {
  const cleanIp = ipString.trim().replace(/^\[|\]$/g, "");

  if (!ipaddr.isValid(cleanIp)) {
    return {
      ip: cleanIp,
      kind: "ipv4",
      isPublic: false,
      range: "invalid",
      reason: "Malformed or invalid IP address format.",
    };
  }

  // Reject shorthand/non-standard IPv4 representations (e.g., '1.2.3' or octal/hex)
  if (!cleanIp.includes(":") && !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
    return {
      ip: cleanIp,
      kind: "ipv4",
      isPublic: false,
      range: "invalid",
      reason: "IPv4 address must use strict 4-octet dotted decimal notation.",
    };
  }

  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(cleanIp);
  } catch {
    return {
      ip: cleanIp,
      kind: "ipv4",
      isPublic: false,
      range: "invalid",
      reason: "Failed to parse IP address structure.",
    };
  }

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) {
      const ipv4 = ipv6.toIPv4Address();
      const ipv4Range = ipv4.range();
      const isPublic = !FORBIDDEN_IPV4_RANGES.has(ipv4Range) && ipv4Range === "unicast";

      return {
        ip: ipv4.toString(),
        kind: "ipv4",
        isPublic,
        range: `ipv4Mapped(${ipv4Range})`,
        reason: isPublic
          ? undefined
          : `IPv4-mapped address targets prohibited range: ${ipv4Range}.`,
      };
    }

    // Handle IPv4-translated IPv6 addresses (RFC 6052 NAT64 Well-Known Prefix 64:ff9b::/96)
    if (ipv6.range() === "rfc6052") {
      const p = ipv6.parts;
      const octets = [p[6] >> 8, p[6] & 0xff, p[7] >> 8, p[7] & 0xff];
      const ipv4String = octets.join(".");
      let isPublic = false;
      let ipv4Range = "invalid";

      if (ipaddr.isValid(ipv4String)) {
        const embeddedIpv4 = ipaddr.parse(ipv4String) as ipaddr.IPv4;
        ipv4Range = embeddedIpv4.range();
        isPublic = !FORBIDDEN_IPV4_RANGES.has(ipv4Range) && ipv4Range === "unicast";
      }

      return {
        ip: cleanIp,
        kind: "ipv6",
        isPublic,
        range: `rfc6052(${ipv4Range})`,
        reason: isPublic
          ? undefined
          : `RFC 6052 translated IPv6 address targets prohibited IPv4 range: ${ipv4Range}.`,
      };
    }

    const range = ipv6.range();
    if (FORBIDDEN_IPV6_RANGES.has(range) || range !== "unicast") {
      return {
        ip: cleanIp,
        kind: "ipv6",
        isPublic: false,
        range,
        reason: `IPv6 address belongs to non-public range: ${range}.`,
      };
    }

    return {
      ip: cleanIp,
      kind: "ipv6",
      isPublic: true,
      range: "unicast",
    };
  }

  // Standard IPv4 evaluation
  const ipv4 = parsed as ipaddr.IPv4;
  const range = ipv4.range();

  if (FORBIDDEN_IPV4_RANGES.has(range) || range !== "unicast") {
    return {
      ip: cleanIp,
      kind: "ipv4",
      isPublic: false,
      range,
      reason: `IPv4 address belongs to non-public range: ${range}.`,
    };
  }

  return {
    ip: cleanIp,
    kind: "ipv4",
    isPublic: true,
    range: "unicast",
  };
}

export type DnsLookupResult = {
  address: string;
  family: number;
};

export type DnsLookupFunction = (
  hostname: string,
  options: { all: true }
) => Promise<DnsLookupResult[]>;

export interface ValidateUrlOptions {
  /** Injected DNS lookup function for deterministic unit testing */
  dnsLookup?: DnsLookupFunction;
  /** Lookup timeout in milliseconds (default: 4000ms) */
  timeoutMs?: number;
}

export interface ValidatedTargetUrl {
  normalizedUrl: string;
  sanitized: SanitizedUrlResult;
  resolvedIps: string[];
}

/**
 * Validates an untrusted candidate URL against SSRF and private-network access hazards.
 *
 * Execution flow:
 * 1. Syntax & protocol normalization using `sanitizeScanUrl()`.
 * 2. If hostname is an IP literal, evaluate directly against IP classification rules.
 * 3. If hostname is a domain name, resolve ALL A and AAAA records using `node:dns/promises`.
 * 4. Verify that EVERY resolved IP address is a public, globally routable unicast address.
 * 5. Fail closed if any address is private, empty, or timed out.
 *
 * CRITICAL LIMITATION NOTICE:
 * DNS pre-validation alone does NOT fully mitigate SSRF (due to possible DNS rebinding
 * between pre-validation and socket connect, as well as HTTP redirects to prohibited IPs).
 * Full defense requires connection-level destination checking during Playwright navigation (Step 4).
 */
const defaultDnsLookup: DnsLookupFunction = async (hostname) => {
  const res = await dns.lookup(hostname, { all: true });
  return Array.isArray(res) ? res : [res];
};

export async function validateScanTargetUrl(
  inputUrl: unknown,
  options: ValidateUrlOptions = {}
): Promise<ValidatedTargetUrl> {
  const { dnsLookup = defaultDnsLookup, timeoutMs = 4000 } = options;

  // 1. Syntactic and structural validation
  let sanitized: SanitizedUrlResult;
  try {
    sanitized = sanitizeScanUrl(inputUrl);
  } catch (err) {
    if (err instanceof UrlSanitizerError) {
      throw new SsrfError("URL_SANITIZATION_FAILED", err.clientMessage, err.message);
    }
    throw new SsrfError(
      "URL_SANITIZATION_FAILED",
      "URL validation failed due to invalid syntax."
    );
  }

  const { hostname, isIpLiteral, normalizedUrl } = sanitized;

  // 2. Direct evaluation of IP literals
  if (isIpLiteral) {
    const classification = classifyIpAddress(hostname);
    if (!classification.isPublic) {
      throw new SsrfError(
        "FORBIDDEN_IP_RANGE",
        "Target IP address is private, reserved, or non-routable.",
        `IP literal ${hostname} rejected: ${classification.reason ?? classification.range}`
      );
    }

    return {
      normalizedUrl,
      sanitized,
      resolvedIps: [classification.ip],
    };
  }

  // 3. DNS Resolution with timeout
  let records: DnsLookupResult[];
  try {
    const lookupPromise = dnsLookup(hostname, { all: true });

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new SsrfError(
            "DNS_TIMEOUT",
            "DNS resolution timed out for the specified website."
          )
        );
      }, timeoutMs);
    });

    try {
      records = await Promise.race([lookupPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof SsrfError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new SsrfError(
      "DNS_RESOLUTION_FAILED",
      "Unable to resolve the website address via DNS.",
      `DNS lookup failed for ${hostname}: ${message}`
    );
  }

  // 4. Verify results are non-empty
  if (!records || records.length === 0) {
    throw new SsrfError(
      "DNS_EMPTY_RESULTS",
      "DNS lookup returned no IP addresses for the target website."
    );
  }

  // 5. Inspect EVERY resolved IP address (Fail closed on any private or invalid address)
  const resolvedIps: string[] = [];

  for (const record of records) {
    const address = record.address;
    const classification = classifyIpAddress(address);

    if (!classification.isPublic) {
      throw new SsrfError(
        "FORBIDDEN_IP_RANGE",
        "Website resolved to a private or restricted network address.",
        `Hostname ${hostname} resolved to restricted IP ${address} (${classification.reason ?? classification.range})`
      );
    }

    resolvedIps.push(classification.ip);
  }

  return {
    normalizedUrl,
    sanitized,
    resolvedIps,
  };
}
