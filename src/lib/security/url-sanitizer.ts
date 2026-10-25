/**
 * URL Sanitization & Structural Validation Module
 *
 * Deterministically parses, validates, and normalizes candidate scan URLs using the
 * standard WHATWG URL parser before any network lookup or browser interaction.
 */

export type UrlSanitizerErrorCode =
  | "INVALID_TYPE"
  | "EMPTY_INPUT"
  | "EXCESSIVE_LENGTH"
  | "MALFORMED_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIALS_DISALLOWED"
  | "MISSING_HOSTNAME"
  | "MALFORMED_HOSTNAME"
  | "FORBIDDEN_LOCAL_HOSTNAME"
  | "NONSTANDARD_PORT";

export class UrlSanitizerError extends Error {
  public readonly code: UrlSanitizerErrorCode;
  public readonly clientMessage: string;

  constructor(code: UrlSanitizerErrorCode, clientMessage: string, details?: string) {
    super(details ?? clientMessage);
    this.name = "UrlSanitizerError";
    this.code = code;
    this.clientMessage = clientMessage;
    Object.setPrototypeOf(this, UrlSanitizerError.prototype);
  }
}

export interface SanitizedUrlResult {
  /** Canonical, sanitized URL string */
  normalizedUrl: string;
  /** Normalized lowercase hostname without enclosing brackets if IPv6 */
  hostname: string;
  /** Raw hostname extracted from the WHATWG URL object (includes brackets for IPv6) */
  rawHostname: string;
  /** Standardized protocol ('http:' or 'https:') */
  protocol: "http:" | "https:";
  /** Effective port number (80 for http, 443 for https) */
  port: number;
  /** Whether the hostname represents an IP literal (IPv4 or IPv6) */
  isIpLiteral: boolean;
}

/** Maximum permitted length of an input URL string */
const MAX_URL_LENGTH = 2048;

/** Permitted protocol schemes */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Standard public ports. For automated accessibility audits, nonstandard ports
 * are prohibited to prevent internal port scanning and service probing.
 */
const ALLOWED_PORTS_BY_PROTOCOL: Record<string, number> = {
  "http:": 80,
  "https:": 443,
};

/**
 * Reserved local/internal top-level domains and suffixes (RFC 2606, RFC 6761, RFC 6762, RFC 8375).
 * All comparisons are performed on lowercase, trimmed hostname without trailing dots.
 */
const FORBIDDEN_HOSTNAME_SUFFIXES = [
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
 * Validates and normalizes an untrusted URL input string.
 *
 * This function is pure, deterministic, and executes synchronously without
 * performing DNS resolution or socket connections.
 *
 * @param input Untrusted input from user or API client
 * @returns SanitizedUrlResult on success
 * @throws UrlSanitizerError with typed error code on failure
 */
export function sanitizeScanUrl(input: unknown): SanitizedUrlResult {
  // 1. Type validation
  if (typeof input !== "string") {
    throw new UrlSanitizerError(
      "INVALID_TYPE",
      "URL must be a valid text string."
    );
  }

  // 2. Length & emptiness check
  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) {
    throw new UrlSanitizerError("EMPTY_INPUT", "URL cannot be empty.");
  }

  if (trimmedInput.length > MAX_URL_LENGTH) {
    throw new UrlSanitizerError(
      "EXCESSIVE_LENGTH",
      `URL exceeds maximum allowable length of ${MAX_URL_LENGTH} characters.`
    );
  }

  // 3. WHATWG URL Parsing
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedInput);
  } catch {
    throw new UrlSanitizerError(
      "MALFORMED_URL",
      "The provided value is not a valid, well-formed URL."
    );
  }

  // 4. Protocol enforcement (Only HTTP and HTTPS allowed)
  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new UrlSanitizerError(
      "UNSUPPORTED_PROTOCOL",
      "Only public HTTP and HTTPS protocols are supported."
    );
  }
  const protocol = parsedUrl.protocol as "http:" | "https:";

  // 5. Embedded credentials check
  if (parsedUrl.username || parsedUrl.password) {
    throw new UrlSanitizerError(
      "CREDENTIALS_DISALLOWED",
      "URLs containing embedded authentication credentials are not permitted."
    );
  }

  // 6. Hostname inspection & normalization
  const rawHostname = parsedUrl.hostname;
  if (!rawHostname || rawHostname.trim().length === 0) {
    throw new UrlSanitizerError(
      "MISSING_HOSTNAME",
      "URL must contain a valid hostname."
    );
  }

  // Normalize hostname: lowercase and strip trailing dots (FQDN root dot)
  let cleanHostname = rawHostname.toLowerCase();
  while (cleanHostname.endsWith(".")) {
    cleanHostname = cleanHostname.slice(0, -1);
  }

  if (cleanHostname.length === 0) {
    throw new UrlSanitizerError(
      "MALFORMED_HOSTNAME",
      "URL contains an invalid or empty hostname."
    );
  }

  // 7. Check for bracketed IPv6 or raw IP literal
  const isBracketedIpv6 = cleanHostname.startsWith("[") && cleanHostname.endsWith("]");
  let unbracketedHostname = cleanHostname;
  if (isBracketedIpv6) {
    unbracketedHostname = cleanHostname.slice(1, -1);
  }

  // Determine if hostname is an IPv4 or IPv6 literal
  const isIpv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/.test(unbracketedHostname);
  const isIpLiteral = isBracketedIpv6 || isIpv4Pattern;

  // 8. Forbidden local hostnames and domains
  if (!isIpLiteral) {
    // Prohibit localhost exactly
    if (cleanHostname === "localhost") {
      throw new UrlSanitizerError(
        "FORBIDDEN_LOCAL_HOSTNAME",
        "Localhost destinations are strictly prohibited."
      );
    }

    // Prohibit local/internal TLDs and subdomains
    for (const suffix of FORBIDDEN_HOSTNAME_SUFFIXES) {
      if (cleanHostname.endsWith(suffix) || cleanHostname === suffix.slice(1)) {
        throw new UrlSanitizerError(
          "FORBIDDEN_LOCAL_HOSTNAME",
          "Local, test, and private domain names are strictly prohibited."
        );
      }
    }

    // Reject hostnames with invalid characters, spaces, or malformed label structures
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(cleanHostname)) {
      throw new UrlSanitizerError(
        "MALFORMED_HOSTNAME",
        "Hostname contains invalid domain characters or formatting."
      );
    }
  }

  // 9. Standard Port Validation
  const standardPort = ALLOWED_PORTS_BY_PROTOCOL[protocol];
  let effectivePort = standardPort;

  if (parsedUrl.port && parsedUrl.port !== "") {
    const parsedPortNumber = Number.parseInt(parsedUrl.port, 10);
    if (Number.isNaN(parsedPortNumber) || parsedPortNumber < 1 || parsedPortNumber > 65535) {
      throw new UrlSanitizerError(
        "NONSTANDARD_PORT",
        "URL contains an invalid port number."
      );
    }

    if (parsedPortNumber !== standardPort) {
      throw new UrlSanitizerError(
        "NONSTANDARD_PORT",
        `Non-standard ports are prohibited. Only standard ports (80 for HTTP, 443 for HTTPS) are allowed.`
      );
    }
    effectivePort = parsedPortNumber;
  }

  // 10. Construct canonical normalized URL
  // Remove credentials (already verified absent), standardize hostname
  parsedUrl.host = rawHostname;
  if (parsedUrl.port === String(standardPort)) {
    parsedUrl.port = "";
  }

  return {
    normalizedUrl: parsedUrl.toString(),
    hostname: unbracketedHostname,
    rawHostname,
    protocol,
    port: effectivePort,
    isIpLiteral,
  };
}
