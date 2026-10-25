import Link from "next/link";
import { Button } from "@/components/ui";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { ScanHistoryTable } from "@/components/scan/ScanHistoryTable";
import { PlusCircle, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Audit History & Analytics — AccessAI",
  description:
    "Explore historical website accessibility audits, severity distributions, recurring rule failures, and multi-format exports.",
};

export default function ScansDashboardPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Audit Scanner
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Audit History & Analytics Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Historical website scans, aggregate severity distributions, and compliance trend telemetry.
          </p>
        </div>

        <div>
          <Link href="/">
            <Button variant="primary" size="md" className="gap-2 shadow-sm">
              <PlusCircle className="w-4 h-4" />
              <span>New Audit</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Analytics & Visualization Section */}
      <section aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" className="sr-only">
          Accessibility Analytics Summary
        </h2>
        <AnalyticsOverview />
      </section>

      {/* Scan History Table Section */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="sr-only">
          All Saved Audits
        </h2>
        <ScanHistoryTable />
      </section>
    </div>
  );
}
