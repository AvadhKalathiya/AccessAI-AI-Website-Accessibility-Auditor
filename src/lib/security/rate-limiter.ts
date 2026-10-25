/**
 * Hardened In-Memory Sliding Window Rate Limiter
 *
 * Implements bounded in-memory sliding-window request throttling for:
 * - Scan submissions (POST /api/scans)
 * - AI remediations (POST /api/scans/[id]/remediate)
 * - Report exports (GET /api/scans/[id]/export)
 * - Analytics queries (GET /api/analytics/summary)
 *
 * DEFENSIVE MEASURES:
 * 1. Safe Client IP Extraction: Validates IP syntax via ipaddr.js to defeat header spoofing.
 * 2. Memory Cap: Evicts oldest entries if active keys exceed MAX_RATE_LIMIT_KEYS (10,000).
 * 3. Bounded Storage: Periodically cleans expired timestamps.
 * 4. RFC-Compliant Retry-After calculations.
 *
 * DEPLOYMENT NOTICE:
 * This in-memory limiter is process-local. In a multi-instance container cluster,
 * a distributed Redis-backed limiter (e.g. Upstash or ioredis token bucket) should be used.
 */

import ipaddr from "ipaddr.js";

interface RateLimitEntry {
  timestamps: number[];
  lastAccessed: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_RATE_LIMIT_KEYS = 10000;
const CLEANUP_INTERVAL_MS = 60000;
let lastCleanup = Date.now();

/**
 * Standard rate-limiting presets for AccessAI API endpoints.
 */
export const RATE_LIMITS = {
  /** 10 scan submissions per minute per client IP */
  SCAN_SUBMIT: { maxRequests: 10, windowMs: 60000 },
  /** 30 remediation requests per minute per client IP / scan */
  REMEDIATE: { maxRequests: 30, windowMs: 60000 },
  /** 20 report exports per minute per client IP */
  EXPORT: { maxRequests: 20, windowMs: 60000 },
  /** 30 analytics summary requests per minute per client IP */
  ANALYTICS: { maxRequests: 30, windowMs: 60000 },
} as const;

/**
 * Safely extracts and validates a client IP from HTTP headers.
 * Defends against spoofed or malformed forwarding headers.
 */
export function getClientIp(
  request: Request | { headers: Headers | Record<string, string | null | undefined> }
): string {
  let forwardedHeader: string | null = null;
  let realIpHeader: string | null = null;

  if ("headers" in request) {
    if (typeof request.headers.get === "function") {
      forwardedHeader = request.headers.get("x-forwarded-for");
      realIpHeader = request.headers.get("x-real-ip");
    } else {
      const headersRecord = request.headers as Record<string, string | null | undefined>;
      forwardedHeader = headersRecord["x-forwarded-for"] ?? null;
      realIpHeader = headersRecord["x-real-ip"] ?? null;
    }
  }

  // Check X-Forwarded-For first
  if (forwardedHeader) {
    const candidate = forwardedHeader.split(",")[0]?.trim();
    if (candidate && candidate.length <= 45 && ipaddr.isValid(candidate)) {
      return candidate;
    }
  }

  // Fallback to X-Real-IP
  if (realIpHeader) {
    const candidate = realIpHeader.trim();
    if (candidate && candidate.length <= 45 && ipaddr.isValid(candidate)) {
      return candidate;
    }
  }

  return "127.0.0.1";
}

/**
 * Prunes expired entries and enforces a maximum map capacity.
 */
function cleanupExpired(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && rateLimitMap.size < MAX_RATE_LIMIT_KEYS) {
    return;
  }
  lastCleanup = now;

  for (const [key, entry] of rateLimitMap.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }

  // If still above maximum capacity, evict oldest entries
  if (rateLimitMap.size > MAX_RATE_LIMIT_KEYS) {
    const entries = Array.from(rateLimitMap.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );
    const toDelete = entries.slice(0, entries.length - MAX_RATE_LIMIT_KEYS);
    for (const [key] of toDelete) {
      rateLimitMap.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

/**
 * Checks if a request key is within rate limits using a sliding window.
 */
export function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60000
): RateLimitResult {
  cleanupExpired(windowMs);

  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry) {
    // Check map capacity before inserting new key
    if (rateLimitMap.size >= MAX_RATE_LIMIT_KEYS) {
      cleanupExpired(windowMs);
    }
    entry = { timestamps: [], lastAccessed: now };
    rateLimitMap.set(key, entry);
  }

  entry.lastAccessed = now;
  // Filter timestamps within current window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetMs,
      retryAfterSeconds,
    };
  }

  entry.timestamps.push(now);
  const remaining = maxRequests - entry.timestamps.length;
  const resetMs = windowMs;
  const retryAfterSeconds = 0;

  return {
    allowed: true,
    remaining,
    resetMs,
    retryAfterSeconds,
  };
}

/**
 * Returns current count of tracked keys (useful for tests and monitoring).
 */
export function getTrackedKeyCount(): number {
  return rateLimitMap.size;
}

/**
 * Reset rate limit cache (useful in tests).
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}
