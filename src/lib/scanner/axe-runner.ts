/**
 * axe-core Accessibility Audit Runner
 *
 * Executes real axe-core analysis on a rendered Playwright Page using the
 * supported @axe-core/playwright AxeBuilder interface.
 */

import { type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import type { AxeResults } from "axe-core";
import fs from "node:fs";
import { ScannerError } from "./browser";

let cachedAxeSource: string | undefined;

/**
 * Loads pristine unbundled axe.min.js directly from disk.
 * This guarantees that Next.js/Webpack server bundling cannot inject
 * synthetic `exports` references into the evaluated browser script.
 */
function getAxeSource(): string | undefined {
  if (!cachedAxeSource) {
    try {
      const axePath = require.resolve("axe-core/axe.min.js");
      cachedAxeSource = fs.readFileSync(axePath, "utf8");
    } catch {
      cachedAxeSource = undefined;
    }
  }
  return cachedAxeSource;
}

export interface AxeRunnerOptions {
  /** Maximum execution timeout in milliseconds (default: 10000ms) */
  timeoutMs?: number;
  /** Include best-practice rules alongside WCAG criteria (default: true) */
  includeBestPractices?: boolean;
}

/**
 * Standard WCAG conformance tags verified against the installed axe-core engine.
 */
export const SUPPORTED_WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/**
 * Runs axe-core against an active, stabilized Playwright page.
 *
 * @param page Stabilized Playwright Page instance
 * @param options Evaluation options
 * @returns Raw AxeResults from axe-core
 */
export async function runAxeAudit(
  page: Page,
  options: AxeRunnerOptions = {}
): Promise<AxeResults> {
  const { timeoutMs = 10000, includeBestPractices = true } = options;

  // Build tag scope
  const tags: string[] = [...SUPPORTED_WCAG_TAGS];
  if (includeBestPractices) {
    tags.push("best-practice");
  }

  const axeSource = getAxeSource();
  const builder = new AxeBuilder({ page, axeSource }).withTags(tags);

  const executeAudit = async (): Promise<AxeResults> => {
    try {
      return await builder.analyze();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If axe cross-frame partial analysis fails due to sandboxed/unresponsive iframes or UMD exports issues,
      // fallback to legacy mode (runs axe on the main frame without cross-frame worker scripts)
      if (
        msg.includes("exports is not defined") ||
        msg.includes("newContext") ||
        msg.includes("error-handling.md") ||
        msg.includes("Evaluation failed")
      ) {
        return await new AxeBuilder({ page, axeSource }).withTags(tags).setLegacyMode(true).analyze();
      }
      throw err;
    }
  };

  const auditPromise = executeAudit();

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ScannerError({
          code: "AXE_TIMEOUT",
          clientMessage: "axe-core analysis timed out on the target page.",
          technicalDetails: `Axe evaluation exceeded ${timeoutMs}ms limit.`,
        })
      );
    }, timeoutMs);
  });

  try {
    const results = await Promise.race([auditPromise, timeoutPromise]);
    return results;
  } catch (err) {
    if (err instanceof ScannerError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannerError({
      code: "AXE_AUDIT_FAILED",
      clientMessage: "An error occurred during axe-core accessibility evaluation.",
      technicalDetails: msg,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
