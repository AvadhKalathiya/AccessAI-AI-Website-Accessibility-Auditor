"use client";

import * as React from "react";
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
  Search,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { ScanWithMetrics } from "@/lib/db/scan-repository";

export function ScanHistoryTable() {
  const [items, setItems] = React.useState<ScanWithMetrics[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<string>("newest");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchScans = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));

    if (debouncedSearch.trim()) {
      params.set("search", debouncedSearch.trim());
    }

    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

    if (sortBy === "oldest") {
      params.set("sortBy", "oldest");
      params.set("sortDirection", "asc");
    } else if (sortBy === "score") {
      params.set("sortBy", "score");
      params.set("sortDirection", "desc");
    } else if (sortBy === "violations") {
      params.set("sortBy", "violations");
      params.set("sortDirection", "desc");
    } else if (sortBy === "duration") {
      params.set("sortBy", "duration");
      params.set("sortDirection", "desc");
    } else {
      params.set("sortBy", "newest");
      params.set("sortDirection", "desc");
    }

    try {
      const res = await fetch(`/api/scans?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load scans: HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan history.");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, sortBy]);

  React.useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle as="h2" className="text-lg">Audit History</CardTitle>
            <CardDescription className="text-xs">
              Showing {total} saved website accessibility audits with full reports.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchScans}
            disabled={isLoading}
            className="text-xs gap-1.5 h-8 border-border"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-2 border-t border-border/50">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by target URL or domain…"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/40 rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Controls: Status & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-md border border-border">
              {[
                { label: "All", value: "all" },
                { label: "Completed", value: "completed" },
                { label: "In Progress", value: "in_progress" },
                { label: "Failed", value: "failed" },
              ].map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(pill.value);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                    statusFilter === pill.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="bg-muted/40 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="score">Health Score</option>
                <option value="violations">Violations Count</option>
                <option value="duration">Audit Duration</option>
              </select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Error message */}
        {error && (
          <div className="p-6 text-center text-xs text-destructive space-y-2">
            <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={fetchScans}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p>Loading historical audits from database…</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-3">
            <Clock className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-semibold text-foreground text-sm">No Audits Found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {search || statusFilter !== "all"
                  ? "No audits match the current search or status filter."
                  : "You haven't run any website scans yet."}
              </p>
            </div>
            {search || statusFilter !== "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Link href="/">
                <Button variant="primary" size="sm">
                  Run Your First Scan
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Table view */}
        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse" aria-label="Scan history table">
              <thead>
                <tr className="border-y border-border text-muted-foreground bg-muted/20">
                  <th scope="col" className="p-3 font-semibold">Target URL</th>
                  <th scope="col" className="p-3 font-semibold">Status</th>
                  <th scope="col" className="p-3 font-semibold text-center">Score</th>
                  <th scope="col" className="p-3 font-semibold text-center">Violations</th>
                  <th scope="col" className="p-3 font-semibold">Duration</th>
                  <th scope="col" className="p-3 font-semibold">Scanned</th>
                  <th scope="col" className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((scan) => {
                  const isCompleted = scan.status === "completed";
                  const isFailed = scan.status === "failed";
                  const isInProgress = !isCompleted && !isFailed;
                  const score = scan.metrics?.automatedScore ?? null;

                  return (
                    <tr key={scan.id} className="hover:bg-muted/30 transition-colors">
                      {/* Target URL */}
                      <td className="p-3 max-w-xs truncate">
                        <div className="font-mono text-foreground font-medium truncate" title={scan.normalizedUrl}>
                          {scan.normalizedUrl}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          ID: {scan.id.slice(0, 8)}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="p-3 whitespace-nowrap">
                        {isCompleted && <Badge variant="success">Completed</Badge>}
                        {isFailed && <Badge variant="error">Failed</Badge>}
                        {isInProgress && (
                          <Badge variant="warning" className="gap-1 animate-pulse">
                            <Clock className="w-2.5 h-2.5" />
                            <span className="capitalize">{scan.progressStage}</span>
                          </Badge>
                        )}
                      </td>

                      {/* Automated Score */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {score !== null ? (
                          <span
                            className={`font-black font-mono px-2 py-0.5 rounded text-xs ${
                              score >= 80
                                ? "bg-success/10 text-success border border-success/20"
                                : score >= 50
                                ? "bg-warning/10 text-warning border border-warning/20"
                                : "bg-destructive/10 text-destructive border border-destructive/20"
                            }`}
                          >
                            {score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>

                      {/* Violations breakdown */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {scan.metrics ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="font-bold text-foreground">
                              {scan.metrics.totalRules}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({scan.metrics.totalAffectedElements} nodes)
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "--"}
                      </td>

                      {/* Timestamp */}
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {new Date(scan.createdAt).toLocaleDateString()}{" "}
                        <span className="text-[10px]">
                          {new Date(scan.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <Link href={`/scans/${scan.id}`}>
                          <Button
                            variant={isCompleted ? "outline" : "secondary"}
                            size="sm"
                            className="text-xs h-7 gap-1"
                          >
                            <span>{isCompleted ? "View Report" : "Inspect"}</span>
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && !error && total > 0 && (
          <div className="p-3.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
            <div>
              Page <span className="font-semibold text-foreground">{page}</span> of{" "}
              <span className="font-semibold text-foreground">{totalPages}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 px-2 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 px-2 text-xs gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
