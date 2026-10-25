/**
 * Playwright Browser Lifecycle & Context Management
 *
 * Manages headless Chromium lifecycle, resource bounding, isolated incognito contexts,
 * request-level route filtering, and guaranteed cleanup of browser processes.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { type ScannerErrorCode, type ScannerErrorDetails } from "./types";
import { type OutboundProxyInstance } from "./outbound-proxy";

export class ScannerError extends Error {
  public readonly code: ScannerErrorCode;
  public readonly clientMessage: string;
  public readonly technicalDetails?: string;

  constructor(details: ScannerErrorDetails) {
    super(details.clientMessage);
    this.name = "ScannerError";
    this.code = details.code;
    this.clientMessage = details.clientMessage;
    this.technicalDetails = details.technicalDetails;
    Object.setPrototypeOf(this, ScannerError.prototype);
  }
}

/**
 * Concurrency limiter to cap simultaneous active browser contexts.
 */
class ConcurrencySemaphore {
  private currentActive = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.currentActive < this.maxConcurrent) {
      this.currentActive++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.currentActive++;
  }

  release(): void {
    this.currentActive--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  getActiveCount(): number {
    return this.currentActive;
  }
}

// Global scanner semaphore: maximum 2 concurrent scans to preserve CPU/memory
export const globalScannerSemaphore = new ConcurrencySemaphore(2);

export interface BrowserContextSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export interface LaunchSessionOptions {
  proxy?: OutboundProxyInstance;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
  navigationTimeoutMs?: number;
}

/**
 * Launches an ephemeral, isolated browser session bound to the outbound security proxy.
 */
export async function createIsolatedBrowserSession(
  options: LaunchSessionOptions = {}
): Promise<BrowserContextSession> {
  const {
    proxy,
    viewportWidth = 1280,
    viewportHeight = 800,
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 AccessAI/1.0",
    navigationTimeoutMs = 25000,
  } = options;

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
      ],
      proxy: proxy
        ? {
            server: proxy.serverUrl,
            username: proxy.proxyUsername,
            password: proxy.proxyPassword,
          }
        : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannerError({
      code: "BROWSER_LAUNCH_FAILED",
      clientMessage: "Failed to initialize the headless scanning browser engine.",
      technicalDetails: `Chromium launch failed: ${msg}`,
    });
  }

  let context: BrowserContext;
  try {
    context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      userAgent,
      ignoreHTTPSErrors: false, // NEVER disable TLS certificate verification
      serviceWorkers: "block",  // Block Service Workers to prevent context-level bypasses
      javaScriptEnabled: true,
      acceptDownloads: false,    // Block arbitrary file downloads
      offline: false,
    });
  } catch (err) {
    await browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannerError({
      code: "BROWSER_LAUNCH_FAILED",
      clientMessage: "Failed to configure the isolated browser context.",
      technicalDetails: `Browser context creation failed: ${msg}`,
    });
  }

  // Set default timeouts
  context.setDefaultNavigationTimeout(navigationTimeoutMs);
  context.setDefaultTimeout(navigationTimeoutMs);

  let page: Page;
  try {
    page = await context.newPage();
  } catch (err) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannerError({
      code: "BROWSER_LAUNCH_FAILED",
      clientMessage: "Failed to initialize target webpage page tab.",
      technicalDetails: `Page creation failed: ${msg}`,
    });
  }

  // Browser-level defense-in-depth: Route-level request filtering
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();

    // Block non-HTTP protocols directly in browser context
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      await route.abort("blockedbyclient");
      return;
    }

    // Block heavy media assets to accelerate scanning and save memory
    const resourceType = request.resourceType();
    if (["media", "font"].includes(resourceType)) {
      await route.abort();
      return;
    }

    // Continue verified request
    await route.continue();
  });

  let isClosed = false;
  const close = async () => {
    if (isClosed) return;
    isClosed = true;
    try {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    } catch {
      // Ignore cleanup errors during teardown
    }
  };

  return {
    browser,
    context,
    page,
    close,
  };
}
