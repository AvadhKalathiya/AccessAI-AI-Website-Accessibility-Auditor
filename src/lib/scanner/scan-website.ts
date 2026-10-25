/**
 * AccessAI Main Scanning Orchestrator
 *
 * Coordinates URL pre-validation, outbound security proxy instantiation,
 * Playwright browser session management, axe-core evaluation, and result normalization.
 * Module version: 1.0.1
 */

import { validateScanTargetUrl, SsrfError } from "@/lib/security/ssrf";
import { createOutboundSecurityProxy, type OutboundProxyInstance } from "./outbound-proxy";
import {
  createIsolatedBrowserSession,
  globalScannerSemaphore,
  ScannerError,
  type BrowserContextSession,
} from "./browser";
import { runAxeAudit, SUPPORTED_WCAG_TAGS } from "./axe-runner";
import { normalizeAxeResults } from "./normalizer";
import type { ScanOptions, ScanResult, ScannerErrorDetails } from "./types";
import packageJson from "../../../package.json";

export interface ScanDependencies {
  /** Injectable proxy factory for isolated testing */
  createProxy?: typeof createOutboundSecurityProxy;
  /** Injectable session launcher for isolated testing */
  createSession?: typeof createIsolatedBrowserSession;
}

/**
 * Executes a full accessibility scan on a specified target URL.
 *
 * @param inputUrl Untrusted target URL string
 * @param options Scan configuration options
 * @param deps Optional injected dependencies for unit/integration testing
 */
export async function scanWebsite(
  inputUrl: unknown,
  options: ScanOptions = { url: "" },
  deps: ScanDependencies = {}
): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const warnings: string[] = [];

  const {
    overallTimeoutMs = 35000,
    navigationTimeoutMs = 25000,
    axeTimeoutMs = 10000,
    viewportWidth = 1280,
    viewportHeight = 800,
    includeBestPractices = true,
    userAgent,
  } = options;

  let proxy: OutboundProxyInstance | undefined;
  let session: BrowserContextSession | undefined;
  let finalUrl = typeof inputUrl === "string" ? inputUrl : "";
  let requestedUrl = typeof inputUrl === "string" ? inputUrl : "";

  // Helper to build standardized failure results
  const buildFailureResult = (
    errorDetails: ScannerErrorDetails,
    status: "failed" | "timed_out" = "failed"
  ): ScanResult => {
    const finishedAt = new Date().toISOString();
    return {
      requestedUrl,
      finalUrl,
      status,
      success: false,
      automatedScore: 0,
      severityCounts: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        unknown: 0,
        totalRules: 0,
        totalAffectedElements: 0,
      },
      ruleCounts: {
        passed: 0,
        incomplete: 0,
        inapplicable: 0,
        violations: 0,
      },
      violations: [],
      incomplete: [],
      passedRuleIds: [],
      inapplicableRuleIds: [],
      timing: {
        startedAt,
        finishedAt,
        durationMs: Date.now() - startTime,
      },
      error: errorDetails,
      warnings,
      metadata: {
        axeVersion: "4.10.3",
        playwrightVersion: packageJson.dependencies.playwright || "1.50.0",
        browser: "Chromium (Headless)",
        wcagStandardScope: [...SUPPORTED_WCAG_TAGS],
      },
    };
  };

  // 1. Acquire global concurrency semaphore
  await globalScannerSemaphore.acquire();

  try {
    // 2. Validate URL and perform DNS pre-validation
    await options.onProgress?.("validating", "Validating URL and verifying network safety...");
    let validatedTarget;
    try {
      validatedTarget = await validateScanTargetUrl(inputUrl);
    } catch (err) {
      if (err instanceof SsrfError) {
        const isBlockedDestination =
          err.code === "FORBIDDEN_IP_RANGE" ||
          err.code === "DNS_RESOLUTION_FAILED" ||
          err.code === "DNS_TIMEOUT" ||
          err.code === "DNS_EMPTY_RESULTS";

        return buildFailureResult({
          code: isBlockedDestination ? "BLOCKED_DESTINATION" : "INVALID_TARGET",
          clientMessage: err.clientMessage,
          technicalDetails: err.details,
        });
      }
      return buildFailureResult({
        code: "INVALID_TARGET",
        clientMessage: "URL validation failed.",
        technicalDetails: err instanceof Error ? err.message : String(err),
      });
    }

    requestedUrl = validatedTarget.normalizedUrl;
    finalUrl = validatedTarget.normalizedUrl;

    // 3. Create per-scan outbound security proxy
    const proxyFactory = deps.createProxy || createOutboundSecurityProxy;
    try {
      proxy = await proxyFactory();
    } catch (err) {
      return buildFailureResult({
        code: "INTERNAL_ERROR",
        clientMessage: "Failed to initialize scanner network security boundary.",
        technicalDetails: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Launch isolated Chromium browser session
    const sessionFactory = deps.createSession || createIsolatedBrowserSession;
    try {
      session = await sessionFactory({
        proxy,
        viewportWidth,
        viewportHeight,
        userAgent,
        navigationTimeoutMs,
      });
    } catch (err) {
      if (err instanceof ScannerError) {
        return buildFailureResult(err);
      }
      return buildFailureResult({
        code: "BROWSER_LAUNCH_FAILED",
        clientMessage: "Failed to launch headless browser session.",
        technicalDetails: err instanceof Error ? err.message : String(err),
      });
    }

    // Set up overall scan timeout promise to enforce bounded execution
    let overallTimer: NodeJS.Timeout | undefined;
    const overallTimeoutPromise = new Promise<ScanResult>((resolve) => {
      overallTimer = setTimeout(() => {
        resolve(
          buildFailureResult(
            {
              code: "SCAN_TIMEOUT",
              clientMessage: `Overall scan exceeded maximum time limit of ${overallTimeoutMs / 1000}s.`,
              technicalDetails: `Scan aborted by overall timeout (${overallTimeoutMs}ms limit reached).`,
            },
            "timed_out"
          )
        );
      }, overallTimeoutMs);
    });

    const executionPromise = (async (): Promise<ScanResult> => {
      // 5. Navigate to target with overall deadline enforcement
      const page = session!.page;
      let navigationCompletedAt: string | undefined;

      await options.onProgress?.("navigating", `Navigating to ${requestedUrl}...`);

      try {
        const response = await page.goto(requestedUrl, {
          waitUntil: "domcontentloaded",
          timeout: navigationTimeoutMs,
        });

        navigationCompletedAt = new Date().toISOString();

        if (!response) {
          warnings.push("Page did not return an HTTP response (or was served from cache/local state).");
        } else if (response.status() >= 400) {
          warnings.push(`Target website returned HTTP status ${response.status()} ${response.statusText()}`);
        }

        finalUrl = page.url();

        // Bounded hydration pause for Single-Page Applications (500ms max)
        await page.waitForTimeout(500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Timeout") || msg.includes("timeout")) {
          return buildFailureResult(
            {
              code: "NAVIGATION_TIMEOUT",
              clientMessage: "Website took too long to load (navigation timeout exceeded).",
              technicalDetails: msg,
            },
            "timed_out"
          );
        }
        if (msg.includes("ERR_CONNECTION") || msg.includes("ERR_NAME_NOT_RESOLVED") || msg.includes("net::")) {
          return buildFailureResult({
            code: "TARGET_UNAVAILABLE",
            clientMessage: "Could not reach target website. Check the web address and server availability.",
            technicalDetails: msg,
          });
        }
        return buildFailureResult({
          code: "BLOCKED_DESTINATION",
          clientMessage: "Navigation was blocked by security policy.",
          technicalDetails: msg,
        });
      }

      // 6. Execute axe-core audit
      await options.onProgress?.("auditing", "Executing axe-core accessibility rule evaluation...");
      let rawAxeResults;
      try {
        rawAxeResults = await runAxeAudit(page, {
          timeoutMs: axeTimeoutMs,
          includeBestPractices,
        });
      } catch (err) {
        if (err instanceof ScannerError) {
          return buildFailureResult(err);
        }
        return buildFailureResult({
          code: "AXE_AUDIT_FAILED",
          clientMessage: "Accessibility rule analysis failed on the target page.",
          technicalDetails: err instanceof Error ? err.message : String(err),
        });
      }

      const auditCompletedAt = new Date().toISOString();

      // 7. Normalize results
      const normalizedData = normalizeAxeResults(rawAxeResults);
      const finishedAt = new Date().toISOString();

      return {
        requestedUrl,
        finalUrl,
        status: "completed",
        success: true,
        automatedScore: normalizedData.automatedScore,
        severityCounts: normalizedData.severityCounts,
        ruleCounts: normalizedData.ruleCounts,
        violations: normalizedData.violations,
        incomplete: normalizedData.incomplete,
        passedRuleIds: normalizedData.passedRuleIds,
        inapplicableRuleIds: normalizedData.inapplicableRuleIds,
        timing: {
          startedAt,
          navigationCompletedAt,
          auditCompletedAt,
          finishedAt,
          durationMs: Date.now() - startTime,
        },
        warnings,
        metadata: {
          axeVersion: rawAxeResults.testEngine?.version || "4.10.3",
          playwrightVersion: packageJson.dependencies.playwright || "1.50.0",
          browser: "Chromium (Headless)",
          wcagStandardScope: [...SUPPORTED_WCAG_TAGS],
        },
      };
    })();

    try {
      const finalResult = await Promise.race([executionPromise, overallTimeoutPromise]);
      return finalResult;
    } finally {
      if (overallTimer) clearTimeout(overallTimer);
    }
  } finally {
    // 8. Guaranteed resource cleanup
    try {
      if (session) await session.close();
    } catch {
      // Ignore session close error during teardown
    }
    try {
      if (proxy) await proxy.close();
    } catch {
      // Ignore proxy close error during teardown
    }
    globalScannerSemaphore.release();
  }
}
