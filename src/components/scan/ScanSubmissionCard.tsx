"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@/components/ui";
import { ShieldAlert, ArrowRight, AlertCircle } from "lucide-react";

export function ScanSubmissionCard() {
  const router = useRouter();
  const [url, setUrl] = React.useState("https://example.com");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to submit scan request.");
        setIsSubmitting(false);
        return;
      }

      // Redirect to persistent scan view
      if (data.id) {
        router.push(`/scans/${data.id}`);
      }
    } catch {
      setErrorMessage("Network error connecting to scan service.");
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="shadow-md border-border text-left">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle as="h2" className="text-base font-semibold">
            Website Accessibility Audit
          </CardTitle>
          <Badge variant="success">Scanning Engine Active (Step 5)</Badge>
        </div>
        <CardDescription>
          Enter a public web address to run real Playwright Chromium and axe-core analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="target-url-input"
            label="Target Website URL"
            description="Enter an accessible, public HTTP/HTTPS web address."
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isSubmitting}
            required
          />

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span>Protected by DNS pinning & outbound security proxy</span>
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="w-full sm:w-auto"
            >
              <span>{isSubmitting ? "Queueing Audit..." : "Run Full Audit"}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
