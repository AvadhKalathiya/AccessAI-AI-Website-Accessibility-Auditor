import Link from "next/link";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from "@/components/ui";
import { ScanSubmissionCard } from "@/components/scan/ScanSubmissionCard";
import {
  Bot,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="w-full flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full max-w-5xl px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center flex flex-col items-center">
        <Badge variant="success" className="mb-4">
          AccessAI v0.1.0 — Production-Ready Autonomous Accessibility Suite
        </Badge>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground max-w-3xl leading-tight">
          High-Fidelity Web Accessibility Auditing with Contextual AI Guidance
        </h1>

        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
          AccessAI renders public webpages using headless Chromium, executes the
          industry-standard axe-core engine, and provides clear, actionable
          remediation code using local Ollama models.
        </p>

        {/* Real Scan Submission Card */}
        <div className="w-full max-w-2xl mt-10">
          <ScanSubmissionCard />
        </div>

        <div className="mt-6 flex items-center justify-center">
          <Link
            href="/scans"
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1.5 bg-primary/5 px-3.5 py-1.5 rounded-full border border-primary/20"
          >
            <span>View Historical Audits & Compliance Analytics Dashboard</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </section>

      {/* Compliance & Limitation Notice */}
      <section
        id="compliance-scope"
        className="w-full max-w-5xl px-4 sm:px-6 py-6"
      >
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 sm:p-5 text-sm text-foreground flex items-start gap-3.5">
          <AlertTriangle
            className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h2 className="font-semibold text-foreground text-sm">
              Notice on Automated Testing & WCAG Conformance
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
              Automated scanners (including axe-core) reliably detect between{" "}
              <strong>30% and 57%</strong> of WCAG issues. Critical criteria
              such as logical tab sequence, keyboard focus traps, contextual alt
              text validity, and screen reader clarity require human evaluation.
              AccessAI is designed as an automated triage tool and does not
              substitute for manual assistive technology audits.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Preview Section */}
      <section
        id="features"
        className="w-full max-w-5xl px-4 sm:px-6 py-12 sm:py-16"
      >
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            Designed for Modern Frontend Engineering
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
            Combining deterministic browser rule evaluation with local LLM
            reasoning to streamline accessibility compliance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-2">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <CardTitle as="h3" className="text-base">
                Real DOM & axe-core Scanning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Audits real, client-hydrated single-page applications using
                Playwright Chromium. Pinpoints exact DOM selectors and failing
                HTML code.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Bot className="w-5 h-5" aria-hidden="true" />
              </div>
              <CardTitle as="h3" className="text-base">
                Local AI Remediation (Ollama)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Leverages local models without exposing sensitive page contents
                to external APIs. Produces concrete HTML/ARIA code snippets and
                remediation guidance.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-2">
                <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
              </div>
              <CardTitle as="h3" className="text-base">
                Persistent Reports & Export
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Tracks audit history with local SQLite persistence. Exports
                standardized findings in CSV, JSON, and print-optimized PDF
                formats for compliance reviews.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Component Library Showcase */}
      <section className="w-full max-w-5xl px-4 sm:px-6 pb-20">
        <Card className="border-border">
          <CardHeader>
            <CardTitle as="h2" className="text-lg">
              Design System Component Primitives
            </CardTitle>
            <CardDescription>
              Accessible UI components with verified keyboard navigation,
              focus-visible styling, and high-contrast color ratios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
                Badge Variants
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="info">Informational</Badge>
                <Badge variant="success">WCAG AA Compliant</Badge>
                <Badge variant="warning">Moderate Contrast</Badge>
                <Badge variant="error">Critical Violation</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
                Button Variants & States
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="sm">
                  Primary Sm
                </Button>
                <Button variant="secondary" size="md">
                  Secondary Md
                </Button>
                <Button variant="outline" size="md">
                  Outline
                </Button>
                <Button variant="destructive" size="md">
                  Destructive
                </Button>
                <Button variant="primary" size="md" isLoading>
                  Loading
                </Button>
                <Button variant="primary" size="md" disabled>
                  Disabled
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
