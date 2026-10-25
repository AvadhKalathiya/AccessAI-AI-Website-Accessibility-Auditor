/**
 * AccessAI Database Schema (Drizzle ORM + SQLite)
 *
 * Implements a normalized relational schema for scans, accessibility violations,
 * affected DOM nodes, and aggregate scan metrics.
 *
 * All timestamps are recorded as UTC epoch milliseconds for consistency.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

/**
 * Valid lifecycle states for an accessibility scan
 */
export const SCAN_STATUSES = [
  "queued",
  "validating",
  "navigating",
  "auditing",
  "saving",
  "completed",
  "failed",
] as const;

export type DbScanStatus = (typeof SCAN_STATUSES)[number];

/**
 * Table A: scans
 * Core entity tracking scan request lifecycle, target URLs, and metadata.
 */
export const scans = sqliteTable(
  "scans",
  {
    id: text("id").primaryKey(), // UUID string
    submittedUrl: text("submitted_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    finalUrl: text("final_url"),
    status: text("status", { enum: SCAN_STATUSES }).notNull().default("queued"),
    progressStage: text("progress_stage").notNull().default("queued"),
    statusMessage: text("status_message").notNull().default("Scan job queued."),
    
    // Timestamps stored as UTC milliseconds
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    durationMs: integer("duration_ms"),

    // Error details (safe for client consumption)
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    errorDetails: text("error_details"),

    // Scanner runtime telemetry and configuration
    scannerMetadata: text("scanner_metadata"), // JSON string
    warnings: text("warnings"), // JSON array of string warnings
    hasTruncatedData: integer("has_truncated_data", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    statusIdx: index("scans_status_idx").on(table.status),
    createdAtIdx: index("scans_created_at_idx").on(table.createdAt),
    normalizedUrlIdx: index("scans_normalized_url_idx").on(table.normalizedUrl),
  })
);

/**
 * Table B: violations
 * Unique accessibility rule violations identified by axe-core for a specific scan.
 */
export const violations = sqliteTable(
  "violations",
  {
    id: text("id").primaryKey(), // UUID string
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    impact: text("impact", { enum: ["critical", "serious", "moderate", "minor", "unknown"] })
      .notNull()
      .default("unknown"),
    description: text("description").notNull(),
    helpText: text("help_text").notNull(),
    helpUrl: text("help_url").notNull(),
    tags: text("tags").notNull(), // JSON array of tags (e.g. ['wcag2a', 'cat.color'])
    wcagTags: text("wcag_tags").notNull(), // JSON array of specific WCAG criteria
    affectedCount: integer("affected_count").notNull().default(0),
    metadata: text("metadata"), // JSON object for optional rule properties
  },
  (table) => ({
    scanIdIdx: index("violations_scan_id_idx").on(table.scanId),
    ruleIdIdx: index("violations_rule_id_idx").on(table.ruleId),
    impactIdx: index("violations_impact_idx").on(table.impact),
  })
);

/**
 * Table C: affected_nodes
 * Individual DOM element instances violating a specific rule.
 */
export const affectedNodes = sqliteTable(
  "affected_nodes",
  {
    id: text("id").primaryKey(), // UUID string
    violationId: text("violation_id")
      .notNull()
      .references(() => violations.id, { onDelete: "cascade" }),
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    targetSelectors: text("target_selectors").notNull(), // JSON array (e.g. ['div#main > button'])
    htmlSnippet: text("html_snippet").notNull(), // Bounded string <= 500 chars
    failureSummary: text("failure_summary").notNull(),
    relatedNodes: text("related_nodes"), // JSON array of related elements
  },
  (table) => ({
    violationIdIdx: index("affected_nodes_violation_id_idx").on(table.violationId),
    scanIdIdx: index("affected_nodes_scan_id_idx").on(table.scanId),
  })
);

/**
 * Table D: scan_metrics
 * One-to-one summary metrics and counts for a scan.
 */
export const scanMetrics = sqliteTable(
  "scan_metrics",
  {
    id: text("id").primaryKey(), // UUID string
    scanId: text("scan_id")
      .notNull()
      .unique()
      .references(() => scans.id, { onDelete: "cascade" }),
    automatedScore: integer("automated_score").notNull().default(0),
    totalRules: integer("total_rules").notNull().default(0),
    totalAffectedElements: integer("total_affected_elements").notNull().default(0),
    criticalRules: integer("critical_rules").notNull().default(0),
    seriousRules: integer("serious_rules").notNull().default(0),
    moderateRules: integer("moderate_rules").notNull().default(0),
    minorRules: integer("minor_rules").notNull().default(0),
    unknownRules: integer("unknown_rules").notNull().default(0),
    passedRules: integer("passed_rules").notNull().default(0),
    incompleteChecks: integer("incomplete_checks").notNull().default(0),
    inapplicableRules: integer("inapplicable_rules").notNull().default(0),
    timingNavigationMs: integer("timing_navigation_ms"),
    timingAuditMs: integer("timing_audit_ms"),
  },
  (table) => ({
    scanIdIdx: index("scan_metrics_scan_id_idx").on(table.scanId),
  })
);

/**
 * Table E: remediations
 * Persisted accessibility fix recommendations generated by Ollama or fallback engine.
 */
export const remediations = sqliteTable(
  "remediations",
  {
    id: text("id").primaryKey(), // UUID string
    scanId: text("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    violationId: text("violation_id")
      .notNull()
      .references(() => violations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'ollama' | 'deterministic-rule-engine'
    modelName: text("model_name"), // e.g. 'llama3.2' or null
    source: text("source", { enum: ["ollama", "fallback"] }).notNull(),
    remediationJson: text("remediation_json").notNull(), // Serialized RemediationResult
    createdAt: integer("created_at").notNull(), // UTC epoch ms
    updatedAt: integer("updated_at").notNull(), // UTC epoch ms
  },
  (table) => ({
    scanIdIdx: index("remediations_scan_id_idx").on(table.scanId),
    violationIdIdx: index("remediations_violation_id_idx").on(table.violationId),
    scanViolationIdx: index("remediations_scan_violation_idx").on(table.scanId, table.violationId),
  })
);

// Drizzle Relations for type-safe joins
export const scansRelations = relations(scans, ({ many, one }) => ({
  violations: many(violations),
  remediations: many(remediations),
  metrics: one(scanMetrics, {
    fields: [scans.id],
    references: [scanMetrics.scanId],
  }),
}));

export const violationsRelations = relations(violations, ({ one, many }) => ({
  scan: one(scans, {
    fields: [violations.scanId],
    references: [scans.id],
  }),
  nodes: many(affectedNodes),
  remediations: many(remediations),
}));

export const affectedNodesRelations = relations(affectedNodes, ({ one }) => ({
  violation: one(violations, {
    fields: [affectedNodes.violationId],
    references: [violations.id],
  }),
  scan: one(scans, {
    fields: [affectedNodes.scanId],
    references: [scans.id],
  }),
}));

export const scanMetricsRelations = relations(scanMetrics, ({ one }) => ({
  scan: one(scans, {
    fields: [scanMetrics.scanId],
    references: [scans.id],
  }),
}));

export const remediationsRelations = relations(remediations, ({ one }) => ({
  scan: one(scans, {
    fields: [remediations.scanId],
    references: [scans.id],
  }),
  violation: one(violations, {
    fields: [remediations.violationId],
    references: [violations.id],
  }),
}));
