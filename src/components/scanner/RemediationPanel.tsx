"use client";

import * as React from "react";
import { Button, Badge } from "@/components/ui";
import {
  Sparkles,
  Loader2,
  Check,
  Copy,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import type { RemediationResult } from "@/lib/ai/types";

export interface RemediationPanelProps {
  scanId: string;
  violationId: string;
  ruleId?: string;
}

export function RemediationPanel({
  scanId,
  violationId,
}: RemediationPanelProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [remediation, setRemediation] = React.useState<RemediationResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fetchRemediation = React.useCallback(
    async (regenerate = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scans/${scanId}/remediate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            violationId,
            regenerate,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}: Failed to generate remediation`);
        }

        const data = await response.json();
        setRemediation(data.remediation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load remediation advice.");
      } finally {
        setIsLoading(false);
      }
    },
    [scanId, violationId]
  );

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState && !remediation && !isLoading) {
      fetchRemediation(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      {/* Action Trigger Button */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggle}
          className="text-xs font-semibold gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/5 hover:border-primary"
          aria-expanded={isOpen}
          aria-controls={`remediation-details-${violationId}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isOpen ? "Hide AI Remediation" : "Explain & Suggest Fix with AI"}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 ml-1" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 ml-1" />
          )}
        </Button>

        {remediation && (
          <span className="text-[11px] text-muted-foreground">
            Source:{" "}
            <span className="font-semibold text-foreground capitalize">
              {remediation.source === "ollama" ? "Ollama AI" : "Rule-Based Guidance"}
            </span>
          </span>
        )}
      </div>

      {/* Expandable Remediation Panel */}
      {isOpen && (
        <div
          id={`remediation-details-${violationId}`}
          className="mt-3 p-4 bg-muted/40 rounded-lg border border-border space-y-4 text-xs animate-in fade-in duration-200"
        >
          {/* Loading state */}
          {isLoading && (
            <div className="py-6 flex flex-col items-center justify-center space-y-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs font-medium">Analyzing violation with remediation engine…</p>
              <p className="text-[11px] text-muted-foreground">
                Connecting to local AI or generating deterministic fallback
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="font-semibold">{error}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchRemediation(true)}
                className="text-xs h-7 gap-1 border-destructive/30 hover:bg-destructive/10"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </Button>
            </div>
          )}

          {/* Result view */}
          {remediation && !isLoading && (
            <div className="space-y-4">
              {/* Header with Provider Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="flex items-center gap-2">
                  {remediation.source === "ollama" ? (
                    <Badge variant="success" className="gap-1 font-semibold text-[11px]">
                      <Cpu className="w-3 h-3" />
                      <span>Ollama AI ({remediation.model || "Local Model"})</span>
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="gap-1 font-semibold text-[11px]">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Rule-Based Guidance</span>
                    </Badge>
                  )}
                  {remediation.wcagCriteria.length > 0 && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      WCAG: {remediation.wcagCriteria.join(", ")}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchRemediation(true)}
                  className="text-[11px] h-6 px-2 text-muted-foreground hover:text-foreground gap-1"
                  title="Regenerate recommendation"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Regenerate</span>
                </Button>
              </div>

              {/* Plain-English Explanation */}
              <div>
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1">
                  Plain-English Explanation
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  {remediation.explanation}
                </p>
              </div>

              {/* Why It Matters & User Impact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-card p-3 rounded-md border border-border">
                <div>
                  <h4 className="font-semibold text-foreground text-[11px] uppercase tracking-wider mb-0.5">
                    Why It Matters
                  </h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {remediation.whyItMatters}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-[11px] uppercase tracking-wider mb-0.5">
                    User Impact
                  </h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {remediation.userImpact}
                  </p>
                </div>
              </div>

              {/* Practical Recommended Fix */}
              <div>
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1">
                  Recommended Fix
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  {remediation.recommendedFix}
                </p>
              </div>

              {/* Code Snippets (Before / After) */}
              {(remediation.codeBefore || remediation.codeAfter) && (
                <div className="space-y-3 pt-1">
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">
                    Suggested Code Modification
                  </h4>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {remediation.codeBefore && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-destructive">
                          Before (Non-compliant)
                        </div>
                        <pre className="p-2.5 rounded-md bg-card border border-destructive/20 font-mono text-[11px] overflow-x-auto text-foreground">
                          {remediation.codeBefore}
                        </pre>
                      </div>
                    )}

                    {remediation.codeAfter && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-medium text-success">
                          <span>After (Accessible fix suggestion)</span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(remediation.codeAfter!)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-sans px-1.5 py-0.5 rounded hover:bg-muted"
                          >
                            {copied ? (
                              <>
                                <Check className="w-3 h-3 text-success" />
                                <span className="text-success">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-2.5 rounded-md bg-card border border-success/30 font-mono text-[11px] overflow-x-auto text-foreground">
                          {remediation.codeAfter}
                        </pre>
                      </div>
                    )}
                  </div>

                  {remediation.codeExplanation && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Note: {remediation.codeExplanation}
                    </p>
                  )}
                </div>
              )}

              {/* Testing Steps */}
              {remediation.testingSteps && remediation.testingSteps.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-1">
                    Verification & Testing Steps
                  </h4>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {remediation.testingSteps.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Limitations Notice */}
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                <span className="font-semibold">Review Required: </span>
                {remediation.limitations} All code fixes are suggestions and must be tested in your application context.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
