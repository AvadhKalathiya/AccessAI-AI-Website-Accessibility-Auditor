import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { runAxeAudit, SUPPORTED_WCAG_TAGS } from "@/lib/scanner/axe-runner";

describe("axe-core Runner with Playwright Chromium", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  const violationsFixturePath = path.resolve(__dirname, "../fixtures/accessible-violations.html");
  const cleanFixturePath = path.resolve(__dirname, "../fixtures/clean-accessible.html");

  it("detects genuine accessibility violations on an HTML fixture with intentional flaws", async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    const htmlContent = fs.readFileSync(violationsFixturePath, "utf8");
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

    const results = await runAxeAudit(page, { timeoutMs: 15000 });

    expect(results).toBeDefined();
    expect(results.violations.length).toBeGreaterThan(0);

    const violationIds = results.violations.map((v) => v.id);

    // Should detect missing image alt (wcag111)
    expect(violationIds).toContain("image-alt");

    // Should detect unlabeled form control (wcag332)
    expect(violationIds).toContain("label");

    // Should detect empty button without name (wcag412)
    expect(violationIds).toContain("button-name");

    await page.close();
    await context.close();
    await browser.close();
  }, 30000);

  it("runs cleanly on an accessible fixture without generating false positive violations", async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    const htmlContent = fs.readFileSync(cleanFixturePath, "utf8");
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

    const results = await runAxeAudit(page, { timeoutMs: 15000 });

    expect(results).toBeDefined();
    expect(results.violations.length).toBe(0);
    expect(results.passes.length).toBeGreaterThan(0);

    await page.close();
    await context.close();
    await browser.close();
  }, 30000);

  it("exports supported WCAG tags matching installed axe-core engine", () => {
    expect(SUPPORTED_WCAG_TAGS).toContain("wcag2a");
    expect(SUPPORTED_WCAG_TAGS).toContain("wcag2aa");
    expect(SUPPORTED_WCAG_TAGS).toContain("wcag21aa");
    expect(SUPPORTED_WCAG_TAGS).toContain("wcag22aa");
  });
});
