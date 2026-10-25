/**
 * Security Input Validation & Sanitization Helpers
 *
 * Provides defense-in-depth sanitization functions for:
 * - Strict UUID route parameter verification (prevents unexpected path payloads)
 * - Safe Content-Disposition filename generation (prevents CRLF and path traversal)
 * - SQL LIKE wildcard escaping (prevents query broadening attacks)
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a candidate string is a syntactically valid RFC 4122 UUID.
 */
export function isValidUuid(id: unknown): id is string {
  if (typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Sanitizes an untrusted string for safe embedding into HTTP Content-Disposition filenames.
 *
 * - Strips directory traversal segments ('..', '/', '\\')
 * - Strips control characters and CRLF injection attempts (\r, \n)
 * - Retains strictly alphanumeric characters, hyphens, and dots
 * - Caps maximum string length at 60 characters
 */
export function sanitizeFilenamePart(raw: string): string {
  if (!raw || typeof raw !== "string") return "scan";

  const sanitized = raw
    .replace(/[\r\n\t]/g, "") // Strip CRLF
    .replace(/[^a-zA-Z0-9.-]/g, "-") // Whitelist safe chars
    .replace(/\.{2,}/g, ".") // Neutralize path traversal '..'
    .replace(/^-+|-+$/g, "") // Trim leading/trailing hyphens
    .slice(0, 60);

  return sanitized || "scan";
}

/**
 * Escapes special SQL wildcard characters ('%' and '_') in search terms
 * to prevent user input from broadening LIKE query filters unintentionally.
 */
export function escapeSqlLike(term: string): string {
  if (!term || typeof term !== "string") return "";
  return term.replace(/([%_\\])/g, "\\$1");
}
