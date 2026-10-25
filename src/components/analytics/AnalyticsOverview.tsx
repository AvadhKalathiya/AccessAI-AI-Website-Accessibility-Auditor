"use client";

import * as React from "react";
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
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Clock,
  Layers,
  TrendingUp,
  Table as TableIcon,
  BarChart2,
  Calendar,
} from "lucide-react";
import type { AnalyticsSummary } from "@/lib/db/scan-repository";

const SEVERITY_COLORS = {
  critical: "#dc2626", // Red 600
  serious: "#ea580c", // Orange 600
  moderate: "#d97706", // Amber 600
  minor: "#64748b", // Slate 500
};

export function AnalyticsOverview() {
  const [rangeDays, setRangeDays] = React.useState<number>(30);
  const [data, setData] = React.useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showDataTable, setShowDataTable] = React.useState(false);

  const fetchAnalytics = React.useCallback(async (days: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics/summary?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAnalytics(rangeDays);
  }, [rangeDays, fetchAnalytics]);

  const severityPieData = React.useMemo(() => {
    if (!data) return [];
    return [
      { name: "Critical", value: data.severityDistribution.critical, color: SEVERITY_COLORS.critical },
      { name: "Serious", value: data.severityDistribution.serious, color: SEVERITY_COLORS.serious },
      { name: "Moderate", value: data.severityDistribution.moderate, color: SEVERITY_COLORS.moderate },
      { name: "Minor", value: data.severityDistribution.minor, color: SEVERITY_COLORS.minor },
    ].filter((item) => item.value > 0);
  }, [data]);

  const severityBarData = React.useMemo(() => {
    if (!data) return [];
    return [
      { severity: "Critical", count: data.severityDistribution.critical, fill: SEVERITY_COLORS.critical },
      { severity: "Serious", count: data.severityDistribution.serious, fill: SEVERITY_COLORS.serious },
      { severity: "Moderate", count: data.severityDistribution.moderate, fill: SEVERITY_COLORS.moderate },
      { severity: "Minor", count: data.severityDistribution.minor, fill: SEVERITY_COLORS.minor },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Range controls & Accessible Table toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Time Horizon:</span>
          <div className="flex items-center gap-1.5">
            {[7, 30, 90, 0].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  rangeDays === days
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {days === 0 ? "All Time" : `${days} Days`}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowDataTable(!showDataTable)}
          className="text-xs gap-1.5 h-8 border-border"
        >
          {showDataTable ? <BarChart2 className="w-3.5 h-3.5 text-primary" /> : <TableIcon className="w-3.5 h-3.5 text-primary" />}
          <span>{showDataTable ? "Show Visual Charts" : "View Accessible Data Table"}</span>
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Total Audits</span>
              <Activity className="w-3.5 h-3.5 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black text-foreground">
              {isLoading ? "--" : data?.totalScans ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data?.completedScans ?? 0} completed • {data?.failedScans ?? 0} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Violations Detected</span>
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black text-foreground">
              {isLoading ? "--" : data?.totalViolations ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Across {data?.totalAffectedElements ?? 0} DOM elements
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Avg Violations / Scan</span>
              <Layers className="w-3.5 h-3.5 text-primary" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black text-foreground">
              {isLoading ? "--" : data?.averageViolationsPerCompletedScan ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Completed scans baseline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>In-Progress Queue</span>
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl sm:text-3xl font-black text-foreground">
              {isLoading ? "--" : data?.inProgressScans ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data?.mostRecentScanDate
                ? `Last: ${new Date(data.mostRecentScanDate).toLocaleDateString()}`
                : "No active jobs"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accessible Data Table Representation (For Screen Readers or Users requesting tabular view) */}
      {showDataTable ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-base">Audit Trend Data Table</CardTitle>
            <CardDescription className="text-xs">
              Tabular breakdown of historical scan activity and violations.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse" aria-label="Historical scan trend data">
              <thead>
                <tr className="border-b border-border text-muted-foreground bg-muted/30">
                  <th scope="col" className="p-2.5 font-semibold">Date</th>
                  <th scope="col" className="p-2.5 font-semibold text-right">Total Scans</th>
                  <th scope="col" className="p-2.5 font-semibold text-right">Completed</th>
                  <th scope="col" className="p-2.5 font-semibold text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {data?.trends && data.trends.length > 0 ? (
                  data.trends.map((t) => (
                    <tr key={t.date} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-2.5 font-mono">{t.date}</td>
                      <td className="p-2.5 text-right font-medium">{t.totalScans}</td>
                      <td className="p-2.5 text-right text-success font-medium">{t.completedScans}</td>
                      <td className="p-2.5 text-right text-destructive font-medium">{t.failedScans}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No historical trend data recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        /* Recharts Visualizations Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Daily Audit Volume & Completed Scans */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h3" className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span>Audit Activity Over Time</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Total scans initiated and successfully completed by date.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-2">
              {data?.trends && data.trends.some((t) => t.totalScans > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="totalScansGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={(val) => val.slice(5)}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        color: "#fff",
                        fontSize: "12px",
                        borderRadius: "6px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalScans"
                      name="Total Scans"
                      stroke="#0284c7"
                      fillOpacity={1}
                      fill="url(#totalScansGrad)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="completedScans"
                      name="Completed"
                      stroke="#16a34a"
                      fillOpacity={1}
                      fill="url(#completedGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No scan activity in this time range.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Violations by Severity (Bar Chart) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h3" className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span>Violations by Severity</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Aggregate violation counts broken down by axe-core impact level.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-2">
              {data && data.totalViolations > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={severityBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="severity" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        color: "#fff",
                        fontSize: "12px",
                        borderRadius: "6px",
                      }}
                    />
                    <Bar dataKey="count" name="Violations" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No violations recorded in this time range.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 3: Severity Distribution (Donut Chart) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h3" className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>Severity Share Distribution</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Proportional breakdown of accessibility barriers.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-2 flex items-center justify-center">
              {severityPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {severityPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        color: "#fff",
                        fontSize: "12px",
                        borderRadius: "6px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-muted-foreground">No severity data available.</div>
              )}
            </CardContent>
          </Card>

          {/* Chart 4: Top Violating Rules */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle as="h3" className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <span>Most Frequently Violated Rules</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Top recurring accessibility rule failures across scanned sites.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {data?.topRules && data.topRules.length > 0 ? (
                <div className="space-y-2.5">
                  {data.topRules.map((r) => (
                    <div key={r.ruleId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <Badge
                          variant={
                            r.impact === "critical"
                              ? "error"
                              : r.impact === "serious"
                              ? "warning"
                              : "neutral"
                          }
                          className="uppercase text-[9px] px-1 py-0"
                        >
                          {r.impact}
                        </Badge>
                        <span className="font-mono text-foreground truncate">{r.ruleId}</span>
                      </div>
                      <span className="font-semibold text-muted-foreground whitespace-nowrap">
                        {r.violationCount} occurrence{r.violationCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                  No rule failure trends recorded yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
