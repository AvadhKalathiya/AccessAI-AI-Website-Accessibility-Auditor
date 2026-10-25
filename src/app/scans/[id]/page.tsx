"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Search,
} from "lucide-react";
import type { FullScanReport } from "@/lib/db/scan-repository";
import { RemediationPanel } from "@/components/scanner/RemediationPanel";
import { ExportMenu } from "@/components/export/ExportMenu";

export default function ScanReportPage() {
  const params = useParams();
  const id = params?.id as string;

  const [report, setReport] = React.useState<FullScanReport | null>(null);
  const [status, setStatus] = React.useState<string>("queued");
  const [stage, setStage] = React.useState<string>("queued");
  const [statusMessage, setStatusMessage] = React.useState<string>("Connecting to scan progress stream...");
  const [errorDetails, setErrorDetails] = React.useState<string | null>(null);

  // Client-side violation filter state
  const [violationSearch, setViolationSearch] = React.useState<string>("");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");

  const filteredViolations = React.useMemo(() => {
    if (!report?.violations) return [];
    return report.violations.filter((v) => {
      if (severityFilter !== "all" && v.impact !== severityFilter) {
        return false;
      }
      if (violationSearch.trim()) {
        const q = violationSearch.toLowerCase();
        const matchesRule = v.ruleId.toLowerCase().includes(q);
        const matchesDesc = v.description.toLowerCase().includes(q);
        const matchesHelp = v.helpText.toLowerCase().includes(q);
        const matchesSelector = v.nodes.some((n) =>
          n.targetSelectors.some((s) => s.toLowerCase().includes(q))
        );
        if (!matchesRule && !matchesDesc && !matchesHelp && !matchesSelector) {
          return false;
        }
      }
      return true;
    });
  }, [report, severityFilter, violationSearch]);

  // Fetch full report from API
  const fetchReport = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/scans/${id}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setStatus(data.status);
      }
    } catch (err) {
      console.error("Failed to fetch full scan report:", err);
    }
  }, [id]);

  // Connect to SSE stream
  React.useEffect(() => {
    if (!id) return;

    fetchReport();

    const eventSource = new EventSource(`/api/scans/${id}/progress`);

    eventSource.addEventListener("status", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus(data.status);
        setStage(data.progressStage);
        setStatusMessage(data.statusMessage);
        if (data.errorMessage) {
          setErrorDetails(data.errorMessage);
        }
      } catch {
        // Safe fallback
      }
    });

    eventSource.addEventListener("done", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus(data.status);
      } catch {
        // Safe fallback
      }
      fetchReport();
      eventSource.close();
    });

    eventSource.addEventListener("error", () => {
      // If error occurs, fallback to polling
      fetchReport();
    });

    return () => {
      eventSource.close();
    };
  }, [id, fetchReport]);

  const isTerminal = status === "completed" || status === "failed";

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Back button & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Homepage
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Accessibility Scan Report
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Scan ID: <span className="font-mono">{id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {status === "completed" && <ExportMenu scanId={id} />}
          {status === "completed" && <Badge variant="success">Completed</Badge>}
          {status === "failed" && <Badge variant="error">Scan Failed</Badge>}
          {!isTerminal && (
            <Badge variant="warning" className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>In Progress ({stage})</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Progress / Status Banner */}
      {!isTerminal && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {statusMessage}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current stage: <span className="capitalize font-medium">{stage}</span>. Real-time updates via Server-Sent Events.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failure Banner */}
      {status === "failed" && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-6 flex items-start gap-3.5 text-destructive">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold">Audit Execution Aborted</h2>
              <p className="text-xs mt-1 leading-relaxed">
                {errorDetails || statusMessage || "The target site could not be audited due to security restrictions or network timeout."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan Summary Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs">Automated Heuristic Score</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-black text-primary">
                {report.metrics?.automatedScore ?? "--"}
                <span className="text-sm text-muted-foreground font-normal">/100</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs">Violating Rules</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-black text-foreground">
                {report.metrics?.totalRules ?? report.violations.length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs">Affected DOM Elements</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-black text-foreground">
                {report.metrics?.totalAffectedElements ?? "--"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs">Execution Duration</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-black text-foreground">
                {report.durationMs ? `${(report.durationMs / 1000).toFixed(1)}s` : "--"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Target Metadata */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">Target Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Target URL:</span>
              <a
                href={report.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-primary flex items-center gap-1 hover:underline break-all"
              >
                <span>{report.normalizedUrl}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {report.finalUrl && report.finalUrl !== report.normalizedUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Final Navigated URL:</span>
                <span className="font-mono break-all">{report.finalUrl}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1">
              <span className="text-muted-foreground">Scan Timestamp:</span>
              <span>{new Date(report.createdAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Violations List */}
      {report && report.violations && report.violations.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                Detected Violations ({filteredViolations.length} of {report.violations.length})
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Evaluated against axe-core WCAG 2.1 & 2.2 Level A/AA criteria.
              </p>
            </div>

            <Badge variant="neutral">
              {report.metrics?.totalAffectedElements} affected elements
            </Badge>
          </div>

          {/* Filter and Search Bar */}
          <div className="p-3 bg-card border border-border rounded-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={violationSearch}
                onChange={(e) => setViolationSearch(e.target.value)}
                placeholder="Search rule ID, selector, or keyword…"
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/40 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded border border-border">
              {["all", "critical", "serious", "moderate", "minor"].map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                    severityFilter === sev
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Filtered Violations Empty State */}
          {filteredViolations.length === 0 ? (
            <Card className="p-8 text-center text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">No matching violations found</p>
              <p>Try adjusting your search query or severity filter.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setViolationSearch("");
                  setSeverityFilter("all");
                }}
                className="mt-2 text-xs"
              >
                Reset Filters
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredViolations.map((violation) => (
                <Card key={violation.id} className="overflow-hidden">
                  <div className="p-5 border-b border-border/50 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          violation.impact === "critical"
                            ? "error"
                            : violation.impact === "serious"
                            ? "warning"
                            : "neutral"
                        }
                        className="uppercase font-bold"
                      >
                        {violation.impact}
                      </Badge>
                      <span className="font-mono font-semibold text-sm text-foreground">
                        {violation.ruleId}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {violation.affectedCount} node{violation.affectedCount === 1 ? "" : "s"} affected
                    </span>
                  </div>

                  <CardContent className="p-5 space-y-4">
                    <p className="text-sm text-foreground leading-relaxed">
                      {violation.description}
                    </p>

                    <div className="bg-muted/50 p-3 rounded-md text-xs space-y-1">
                      <p className="font-semibold text-foreground">Remediation Guidance:</p>
                      <p className="text-muted-foreground">{violation.helpText}</p>
                      <a
                        href={violation.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 mt-1 font-medium"
                      >
                        <span>Read axe-core documentation</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Nodes & Selectors */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Affected Element Code & Selectors:
                      </p>
                      {violation.nodes.map((node) => (
                        <div
                          key={node.id}
                          className="p-3 bg-muted/30 border border-border/60 rounded-md space-y-2 text-xs"
                        >
                          <div>
                            <span className="text-muted-foreground font-medium mr-1.5">Selector:</span>
                            <code className="bg-card px-1.5 py-0.5 rounded border border-border font-mono text-primary">
                              {node.targetSelectors.join(" ")}
                            </code>
                          </div>
                          {node.htmlSnippet && (
                            <div>
                              <span className="text-muted-foreground font-medium block mb-1">Snippet:</span>
                              <pre className="bg-card p-2 rounded border border-border font-mono text-[11px] overflow-x-auto text-foreground">
                                {node.htmlSnippet}
                              </pre>
                            </div>
                          )}
                          {node.failureSummary && (
                            <p className="text-[11px] text-muted-foreground italic">
                              {node.failureSummary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* AI & Rule-based Remediation Engine */}
                    <RemediationPanel
                      scanId={id}
                      violationId={violation.id}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clean Zero-Violations State */}
      {report && report.violations && report.violations.length === 0 && status === "completed" && (
        <Card className="border-success/30 bg-success/5 text-center p-8">
          <div className="flex flex-col items-center justify-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-success" />
            <h2 className="text-lg font-bold text-foreground">No Automated Violations Detected</h2>
            <p className="text-xs text-muted-foreground max-w-md">
              axe-core found 0 automated rule violations on this webpage. Please note that manual review is still required for complete WCAG conformance.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
