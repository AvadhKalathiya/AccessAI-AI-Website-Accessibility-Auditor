/**
 * Scan Repository Layer
 *
 * Implements typed, transactional database operations for scans, violations,
 * affected nodes, and scan metrics with Drizzle ORM.
 */

import { eq, desc, asc, sql, count, and, or, like, gte, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import {
  scans,
  violations,
  affectedNodes,
  scanMetrics,
  remediations,
  type DbScanStatus,
} from "./schema";
import { getDb, type AppDatabase } from "./index";
import type { ScanResult, ScannerErrorDetails } from "@/lib/scanner/types";
import type { StoredViolationContext, RemediationResult } from "@/lib/ai/types";
import { escapeSqlLike } from "@/lib/security/validation";

export interface CreateScanInput {
  submittedUrl: string;
  normalizedUrl: string;
}

export interface ListScansOptions {
  limit?: number;
  offset?: number;
  status?: DbScanStatus | "in_progress";
  search?: string;
  sortBy?: "newest" | "oldest" | "score" | "violations" | "duration";
  sortDirection?: "asc" | "desc";
}

export interface AnalyticsSummary {
  rangeDays: number;
  totalScans: number;
  completedScans: number;
  failedScans: number;
  inProgressScans: number;
  totalViolations: number;
  totalAffectedElements: number;
  averageViolationsPerCompletedScan: number;
  averageAutomatedScore: number;
  mostRecentScanDate: number | null;
  severityDistribution: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    unknown: number;
  };
  trends: Array<{
    date: string;
    totalScans: number;
    completedScans: number;
    failedScans: number;
    totalViolations: number;
  }>;
  topRules: Array<{
    ruleId: string;
    impact: string;
    violationCount: number;
  }>;
  topDomains: Array<{
    domain: string;
    scanCount: number;
  }>;
}

export interface ScanWithMetrics {
  id: string;
  submittedUrl: string;
  normalizedUrl: string;
  finalUrl: string | null;
  status: DbScanStatus;
  progressStage: string;
  statusMessage: string;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
  hasTruncatedData: boolean;
  warnings: string[];
  metrics: {
    automatedScore: number;
    totalRules: number;
    totalAffectedElements: number;
    criticalRules: number;
    seriousRules: number;
    moderateRules: number;
    minorRules: number;
    unknownRules: number;
    passedRules: number;
    incompleteChecks: number;
    inapplicableRules: number;
  } | null;
}

export interface FullScanReport extends ScanWithMetrics {
  scannerMetadata: Record<string, unknown> | null;
  violations: Array<{
    id: string;
    ruleId: string;
    impact: string;
    description: string;
    helpText: string;
    helpUrl: string;
    tags: string[];
    wcagTags: string[];
    affectedCount: number;
    nodes: Array<{
      id: string;
      targetSelectors: string[];
      htmlSnippet: string;
      failureSummary: string;
      relatedNodes?: unknown[];
    }>;
  }>;
}

/**
 * Scan Repository providing testable operations with optional database injection.
 */
export class ScanRepository {
  private db: AppDatabase;

  constructor(customDb?: AppDatabase) {
    this.db = customDb || getDb();
  }

  /**
   * Creates a new queued scan record.
   */
  async createQueuedScan(input: CreateScanInput): Promise<{ id: string; status: DbScanStatus }> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.insert(scans).values({
      id,
      submittedUrl: input.submittedUrl,
      normalizedUrl: input.normalizedUrl,
      status: "queued",
      progressStage: "queued",
      statusMessage: "Scan job queued for processing.",
      createdAt: now,
      updatedAt: now,
      hasTruncatedData: false,
    });

    return { id, status: "queued" };
  }

  /**
   * Checks if an identical normalized URL was submitted recently and is currently active.
   * Defends against rapid duplicate scan submissions.
   */
  async findRecentActiveScan(
    normalizedUrl: string,
    windowSeconds = 10
  ): Promise<{ id: string; status: DbScanStatus } | null> {
    const cutoff = Date.now() - windowSeconds * 1000;
    const activeStatuses: DbScanStatus[] = [
      "queued",
      "validating",
      "navigating",
      "auditing",
      "saving",
    ];

    const results = await this.db
      .select({ id: scans.id, status: scans.status })
      .from(scans)
      .where(
        and(
          eq(scans.normalizedUrl, normalizedUrl),
          gte(scans.createdAt, cutoff),
          inArray(scans.status, activeStatuses)
        )
      )
      .limit(1);

    return results[0] ?? null;
  }

  /**
   * Retrieves a scan by its ID.
   */
  async getScanById(id: string): Promise<typeof scans.$inferSelect | undefined> {
    const result = await this.db.select().from(scans).where(eq(scans.id, id)).limit(1);
    return result[0];
  }

  /**
   * Updates scan status and progress stage.
   */
  async updateProgress(
    id: string,
    status: DbScanStatus,
    stage: string,
    message: string,
    extra: Partial<{ startedAt: number; finalUrl: string }> = {}
  ): Promise<void> {
    const now = Date.now();
    await this.db
      .update(scans)
      .set({
        status,
        progressStage: stage,
        statusMessage: message,
        updatedAt: now,
        ...extra,
      })
      .where(eq(scans.id, id));
  }

  /**
   * Persists a completed scan along with its violations, affected nodes, and metrics
   * inside an atomic database transaction.
   */
  async completeScan(id: string, result: ScanResult): Promise<void> {
    const now = Date.now();
    const durationMs = result.timing.durationMs;

    this.db.transaction((tx) => {
      // 1. Update scan status
      tx.update(scans)
        .set({
          status: "completed",
          progressStage: "completed",
          statusMessage: "Scan completed successfully.",
          finalUrl: result.finalUrl,
          completedAt: now,
          updatedAt: now,
          durationMs,
          scannerMetadata: JSON.stringify(result.metadata),
          warnings: JSON.stringify(result.warnings),
        })
        .where(eq(scans.id, id))
        .run();

      // 2. Insert scan metrics
      tx.insert(scanMetrics)
        .values({
          id: crypto.randomUUID(),
          scanId: id,
          automatedScore: result.automatedScore,
          totalRules: result.severityCounts.totalRules,
          totalAffectedElements: result.severityCounts.totalAffectedElements,
          criticalRules: result.severityCounts.critical,
          seriousRules: result.severityCounts.serious,
          moderateRules: result.severityCounts.moderate,
          minorRules: result.severityCounts.minor,
          unknownRules: result.severityCounts.unknown,
          passedRules: result.ruleCounts.passed,
          incompleteChecks: result.ruleCounts.incomplete,
          inapplicableRules: result.ruleCounts.inapplicable,
        })
        .run();

      // 3. Insert violations and their affected nodes
      for (const v of result.violations) {
        const violationId = crypto.randomUUID();

        tx.insert(violations)
          .values({
            id: violationId,
            scanId: id,
            ruleId: v.ruleId,
            impact: v.impact,
            description: v.description,
            helpText: v.helpText,
            helpUrl: v.helpUrl,
            tags: JSON.stringify(v.tags),
            wcagTags: JSON.stringify(v.wcagTags),
            affectedCount: v.affectedCount,
          })
          .run();

        for (const node of v.nodes) {
          tx.insert(affectedNodes)
            .values({
              id: crypto.randomUUID(),
              violationId,
              scanId: id,
              targetSelectors: JSON.stringify(node.target),
              htmlSnippet: node.htmlSnippet,
              failureSummary: node.failureSummary,
              relatedNodes: node.relatedNodes ? JSON.stringify(node.relatedNodes) : null,
            })
            .run();
        }
      }
    });
  }

  /**
   * Records a failed scan.
   */
  async recordFailure(id: string, error: ScannerErrorDetails): Promise<void> {
    const now = Date.now();
    await this.db
      .update(scans)
      .set({
        status: "failed",
        progressStage: "failed",
        statusMessage: error.clientMessage,
        errorCode: error.code,
        errorMessage: error.clientMessage,
        errorDetails: error.technicalDetails,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(scans.id, id));
  }

  /**
   * Deletes a scan record and cascades deletion to all associated records.
   */
  async deleteScan(id: string): Promise<void> {
    await this.db.delete(scans).where(eq(scans.id, id));
  }

  /**
   * Lists historical scans with pagination, search, status filtering, and sorting.
   */
  async listScans(options: ListScansOptions = {}): Promise<{
    items: ScanWithMetrics[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const conditions = [];

    // Filter by status (including virtual "in_progress" status)
    if (options.status) {
      if (options.status === "in_progress") {
        conditions.push(
          inArray(scans.status, [
            "queued",
            "validating",
            "navigating",
            "auditing",
            "saving",
          ])
        );
      } else {
        conditions.push(eq(scans.status, options.status));
      }
    }

    // Filter by search query (URL or domain) with escaped LIKE wildcards
    if (options.search && options.search.trim().length > 0) {
      const escaped = escapeSqlLike(options.search.trim());
      const term = `%${escaped}%`;
      conditions.push(
        or(like(scans.submittedUrl, term), like(scans.normalizedUrl, term))
      );
    }

    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined;

    // Sorting
    let orderByClause;
    const isAsc = options.sortDirection === "asc";
    switch (options.sortBy) {
      case "oldest":
        orderByClause = asc(scans.createdAt);
        break;
      case "score":
        orderByClause = isAsc
          ? asc(scanMetrics.automatedScore)
          : desc(scanMetrics.automatedScore);
        break;
      case "violations":
        orderByClause = isAsc
          ? asc(scanMetrics.totalRules)
          : desc(scanMetrics.totalRules);
        break;
      case "duration":
        orderByClause = isAsc
          ? asc(scans.durationMs)
          : desc(scans.durationMs);
        break;
      case "newest":
      default:
        orderByClause = isAsc ? asc(scans.createdAt) : desc(scans.createdAt);
        break;
    }

    // Total count
    const totalResult = await this.db
      .select({ val: count() })
      .from(scans)
      .where(whereClause);
    const total = totalResult[0]?.val ?? 0;

    // Items with metrics
    const rows = await this.db
      .select({
        scan: scans,
        metrics: scanMetrics,
      })
      .from(scans)
      .leftJoin(scanMetrics, eq(scans.id, scanMetrics.scanId))
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const items: ScanWithMetrics[] = rows.map(({ scan, metrics }) => {
      let parsedWarnings: string[] = [];
      try {
        if (scan.warnings) parsedWarnings = JSON.parse(scan.warnings);
      } catch {
        // Safe fallback
      }

      return {
        id: scan.id,
        submittedUrl: scan.submittedUrl,
        normalizedUrl: scan.normalizedUrl,
        finalUrl: scan.finalUrl,
        status: scan.status as DbScanStatus,
        progressStage: scan.progressStage,
        statusMessage: scan.statusMessage,
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        durationMs: scan.durationMs,
        errorCode: scan.errorCode,
        errorMessage: scan.errorMessage,
        errorDetails: scan.errorDetails,
        hasTruncatedData: scan.hasTruncatedData,
        warnings: parsedWarnings,
        metrics: metrics
          ? {
              automatedScore: metrics.automatedScore,
              totalRules: metrics.totalRules,
              totalAffectedElements: metrics.totalAffectedElements,
              criticalRules: metrics.criticalRules,
              seriousRules: metrics.seriousRules,
              moderateRules: metrics.moderateRules,
              minorRules: metrics.minorRules,
              unknownRules: metrics.unknownRules,
              passedRules: metrics.passedRules,
              incompleteChecks: metrics.incompleteChecks,
              inapplicableRules: metrics.inapplicableRules,
            }
          : null,
      };
    });

    return { items, total, limit, offset };
  }

  /**
   * Aggregates real analytics metrics across historical scans within a date range.
   */
  async getAnalyticsSummary(rangeDays = 30): Promise<AnalyticsSummary> {
    const now = Date.now();
    const sinceMs = rangeDays > 0 ? now - rangeDays * 24 * 60 * 60 * 1000 : 0;
    const timeFilter = sinceMs > 0 ? gte(scans.createdAt, sinceMs) : undefined;

    // 1. Fetch scans in time range
    const scanRows = await this.db
      .select({
        id: scans.id,
        status: scans.status,
        normalizedUrl: scans.normalizedUrl,
        createdAt: scans.createdAt,
      })
      .from(scans)
      .where(timeFilter)
      .orderBy(desc(scans.createdAt));

    const totalScans = scanRows.length;
    let completedScans = 0;
    let failedScans = 0;
    let inProgressScans = 0;
    const mostRecentScanDate: number | null = scanRows[0]?.createdAt ?? null;

    const inProgressStatuses = new Set([
      "queued",
      "validating",
      "navigating",
      "auditing",
      "saving",
    ]);

    const domainCounts = new Map<string, number>();

    for (const s of scanRows) {
      if (s.status === "completed") {
        completedScans++;
      } else if (s.status === "failed") {
        failedScans++;
      } else if (inProgressStatuses.has(s.status)) {
        inProgressScans++;
      }

      try {
        const hostname = new URL(s.normalizedUrl).hostname.replace(/^www\./, "");
        domainCounts.set(hostname, (domainCounts.get(hostname) || 0) + 1);
      } catch {
        // Fallback
      }
    }

    const topDomains = Array.from(domainCounts.entries())
      .map(([domain, scanCount]) => ({ domain, scanCount }))
      .sort((a, b) => b.scanCount - a.scanCount)
      .slice(0, 5);

    // 2. Fetch metrics for completed scans in range
    const completedScanIds = scanRows
      .filter((s) => s.status === "completed")
      .map((s) => s.id);

    let totalViolations = 0;
    let totalAffectedElements = 0;
    let sumScore = 0;
    let scoreCount = 0;
    const severityDistribution = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      unknown: 0,
    };

    if (completedScanIds.length > 0) {
      const metricRows = await this.db
        .select()
        .from(scanMetrics)
        .where(inArray(scanMetrics.scanId, completedScanIds));

      for (const m of metricRows) {
        totalViolations += m.totalRules;
        totalAffectedElements += m.totalAffectedElements;
        sumScore += m.automatedScore;
        scoreCount++;
        severityDistribution.critical += m.criticalRules;
        severityDistribution.serious += m.seriousRules;
        severityDistribution.moderate += m.moderateRules;
        severityDistribution.minor += m.minorRules;
        severityDistribution.unknown += m.unknownRules;
      }
    }

    const averageViolationsPerCompletedScan =
      completedScans > 0
        ? Math.round((totalViolations / completedScans) * 10) / 10
        : 0;
    const averageAutomatedScore =
      scoreCount > 0 ? Math.round(sumScore / scoreCount) : 0;

    // 3. Top failing rules across violations
    let topRules: Array<{ ruleId: string; impact: string; violationCount: number }> = [];
    if (completedScanIds.length > 0) {
      const violationRows = await this.db
        .select({
          ruleId: violations.ruleId,
          impact: violations.impact,
          count: count(),
        })
        .from(violations)
        .where(inArray(violations.scanId, completedScanIds))
        .groupBy(violations.ruleId, violations.impact)
        .orderBy(desc(count()))
        .limit(6);

      topRules = violationRows.map((v) => ({
        ruleId: v.ruleId,
        impact: v.impact,
        violationCount: v.count,
      }));
    }

    // 4. Daily trends
    const daysMap = new Map<
      string,
      { totalScans: number; completedScans: number; failedScans: number; totalViolations: number }
    >();

    const numDays = rangeDays > 0 ? Math.min(rangeDays, 90) : 14;
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      daysMap.set(key, { totalScans: 0, completedScans: 0, failedScans: 0, totalViolations: 0 });
    }

    for (const s of scanRows) {
      const key = new Date(s.createdAt).toISOString().split("T")[0];
      const entry = daysMap.get(key) || {
        totalScans: 0,
        completedScans: 0,
        failedScans: 0,
        totalViolations: 0,
      };
      entry.totalScans++;
      if (s.status === "completed") entry.completedScans++;
      if (s.status === "failed") entry.failedScans++;
      daysMap.set(key, entry);
    }

    const trends = Array.from(daysMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      rangeDays,
      totalScans,
      completedScans,
      failedScans,
      inProgressScans,
      totalViolations,
      totalAffectedElements,
      averageViolationsPerCompletedScan,
      averageAutomatedScore,
      mostRecentScanDate,
      severityDistribution,
      trends,
      topRules,
      topDomains,
    };
  }

  /**
   * Retrieves full scan report including violations and affected DOM nodes.
   */
  async getFullScanReport(id: string): Promise<FullScanReport | undefined> {
    const scanRow = await this.db
      .select({
        scan: scans,
        metrics: scanMetrics,
      })
      .from(scans)
      .leftJoin(scanMetrics, eq(scans.id, scanMetrics.scanId))
      .where(eq(scans.id, id))
      .limit(1);

    if (scanRow.length === 0) return undefined;
    const { scan, metrics } = scanRow[0];

    // Fetch violations
    const violationRows = await this.db
      .select()
      .from(violations)
      .where(eq(violations.scanId, id));

    // Fetch affected nodes
    const nodeRows = await this.db
      .select()
      .from(affectedNodes)
      .where(eq(affectedNodes.scanId, id));

    // Group nodes by violation ID
    const nodesByViolation = new Map<string, typeof nodeRows>();
    for (const node of nodeRows) {
      const list = nodesByViolation.get(node.violationId) || [];
      list.push(node);
      nodesByViolation.set(node.violationId, list);
    }

    const formattedViolations = violationRows.map((v) => {
      let tags: string[] = [];
      let wcagTags: string[] = [];
      try {
        if (v.tags) tags = JSON.parse(v.tags);
        if (v.wcagTags) wcagTags = JSON.parse(v.wcagTags);
      } catch {
        // Fallback
      }

      const assignedNodes = (nodesByViolation.get(v.id) || []).map((n) => {
        let targetSelectors: string[] = [];
        let relatedNodes: unknown[] | undefined;
        try {
          if (n.targetSelectors) targetSelectors = JSON.parse(n.targetSelectors);
          if (n.relatedNodes) relatedNodes = JSON.parse(n.relatedNodes);
        } catch {
          // Fallback
        }

        return {
          id: n.id,
          targetSelectors,
          htmlSnippet: n.htmlSnippet,
          failureSummary: n.failureSummary,
          relatedNodes,
        };
      });

      return {
        id: v.id,
        ruleId: v.ruleId,
        impact: v.impact,
        description: v.description,
        helpText: v.helpText,
        helpUrl: v.helpUrl,
        tags,
        wcagTags,
        affectedCount: v.affectedCount,
        nodes: assignedNodes,
      };
    });

    let warnings: string[] = [];
    let scannerMetadata: Record<string, unknown> | null = null;
    try {
      if (scan.warnings) warnings = JSON.parse(scan.warnings);
      if (scan.scannerMetadata) scannerMetadata = JSON.parse(scan.scannerMetadata);
    } catch {
      // Fallback
    }

    return {
      id: scan.id,
      submittedUrl: scan.submittedUrl,
      normalizedUrl: scan.normalizedUrl,
      finalUrl: scan.finalUrl,
      status: scan.status as DbScanStatus,
      progressStage: scan.progressStage,
      statusMessage: scan.statusMessage,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
      errorCode: scan.errorCode,
      errorMessage: scan.errorMessage,
      errorDetails: scan.errorDetails,
      hasTruncatedData: scan.hasTruncatedData,
      warnings,
      scannerMetadata,
      metrics: metrics
        ? {
            automatedScore: metrics.automatedScore,
            totalRules: metrics.totalRules,
            totalAffectedElements: metrics.totalAffectedElements,
            criticalRules: metrics.criticalRules,
            seriousRules: metrics.seriousRules,
            moderateRules: metrics.moderateRules,
            minorRules: metrics.minorRules,
            unknownRules: metrics.unknownRules,
            passedRules: metrics.passedRules,
            incompleteChecks: metrics.incompleteChecks,
            inapplicableRules: metrics.inapplicableRules,
          }
        : null,
      violations: formattedViolations,
    };
  }

  /**
   * Recovers active/queued jobs from previous aborted processes on startup.
   */
  async recoverInterruptedJobs(): Promise<number> {
    const now = Date.now();
    const result = await this.db
      .update(scans)
      .set({
        status: "failed",
        progressStage: "failed",
        statusMessage: "Scan was interrupted by server process restart.",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Process terminated before scan completed.",
        updatedAt: now,
      })
      .where(sql`${scans.status} IN ('queued', 'validating', 'navigating', 'auditing', 'saving')`);

    return result.changes ?? 0;
  }

  /**
   * Retrieves stored violation and its primary affected node context,
   * verifying scan ownership.
   */
  async getStoredViolationContext(
    scanId: string,
    violationId: string
  ): Promise<StoredViolationContext | null> {
    const violationRows = this.db
      .select()
      .from(violations)
      .where(and(eq(violations.id, violationId), eq(violations.scanId, scanId)))
      .limit(1)
      .all();

    if (violationRows.length === 0) {
      return null;
    }

    const v = violationRows[0];

    // Fetch primary affected node
    const nodeRows = this.db
      .select()
      .from(affectedNodes)
      .where(and(eq(affectedNodes.violationId, violationId), eq(affectedNodes.scanId, scanId)))
      .limit(1)
      .all();

    const firstNode = nodeRows[0];

    let tags: string[] = [];
    let wcagTags: string[] = [];
    try {
      if (v.tags) tags = JSON.parse(v.tags);
      if (v.wcagTags) wcagTags = JSON.parse(v.wcagTags);
    } catch {
      // Fallback
    }

    let selector = "";
    if (firstNode?.targetSelectors) {
      try {
        const parsed = JSON.parse(firstNode.targetSelectors);
        selector = Array.isArray(parsed) ? parsed.join(" > ") : String(parsed);
      } catch {
        selector = firstNode.targetSelectors;
      }
    }

    return {
      scanId: v.scanId,
      violationId: v.id,
      ruleId: v.ruleId,
      impact: v.impact,
      description: v.description,
      helpText: v.helpText,
      helpUrl: v.helpUrl,
      tags,
      wcagTags,
      affectedCount: v.affectedCount,
      selector,
      htmlSnippet: firstNode?.htmlSnippet || "",
      failureSummary: firstNode?.failureSummary || "",
    };
  }

  /**
   * Retrieves a previously cached remediation result for a scan and violation.
   */
  async getRemediation(
    scanId: string,
    violationId: string
  ): Promise<RemediationResult | null> {
    const rows = this.db
      .select()
      .from(remediations)
      .where(and(eq(remediations.scanId, scanId), eq(remediations.violationId, violationId)))
      .orderBy(desc(remediations.createdAt))
      .limit(1)
      .all();

    if (rows.length === 0) {
      return null;
    }

    try {
      return JSON.parse(rows[0].remediationJson) as RemediationResult;
    } catch {
      return null;
    }
  }

  /**
   * Persists a remediation result in a transaction.
   */
  async saveRemediation(
    scanId: string,
    violationId: string,
    result: RemediationResult
  ): Promise<void> {
    const now = Date.now();
    const id = crypto.randomUUID();

    this.db.transaction((tx) => {
      const existing = tx
        .select()
        .from(remediations)
        .where(and(eq(remediations.scanId, scanId), eq(remediations.violationId, violationId)))
        .limit(1)
        .all();

      if (existing.length > 0) {
        tx.update(remediations)
          .set({
            provider: result.provider,
            modelName: result.model,
            source: result.source,
            remediationJson: JSON.stringify(result),
            updatedAt: now,
          })
          .where(eq(remediations.id, existing[0].id))
          .run();
      } else {
        tx.insert(remediations)
          .values({
            id,
            scanId,
            violationId,
            provider: result.provider,
            modelName: result.model,
            source: result.source,
            remediationJson: JSON.stringify(result),
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  }
}
