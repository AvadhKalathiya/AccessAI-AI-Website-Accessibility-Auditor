import { ScanRepository } from "@/lib/db/scan-repository";
import { OllamaClient } from "./ollama";
import { buildRemediationPrompt } from "./prompts";
import { generateDeterministicFallback } from "./fallback";
import type { RemediationResult } from "./types";

export interface RemediationServiceOptions {
  repository?: ScanRepository;
  ollamaClient?: OllamaClient;
}

export class RemediationServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "SCAN_NOT_FOUND" | "VIOLATION_NOT_FOUND" | "MISMATCH" | "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "RemediationServiceError";
  }
}

/**
 * Orchestrator service coordinating database retrieval, prompt isolation,
 * live Ollama AI inference, and deterministic rule-based fallback.
 */
export class RemediationService {
  private repository: ScanRepository;
  private ollamaClient: OllamaClient;

  constructor(options: RemediationServiceOptions = {}) {
    this.repository = options.repository || new ScanRepository();
    this.ollamaClient = options.ollamaClient || new OllamaClient();
  }

  /**
   * Generates or retrieves a cached remediation for an accessibility violation.
   */
  async getOrGenerateRemediation(params: {
    scanId: string;
    violationId: string;
    regenerate?: boolean;
  }): Promise<RemediationResult> {
    const { scanId, violationId, regenerate = false } = params;

    // 1. Verify scan existence
    const scan = await this.repository.getScanById(scanId);
    if (!scan) {
      throw new RemediationServiceError(
        `Scan with ID '${scanId}' not found.`,
        "SCAN_NOT_FOUND"
      );
    }

    // 2. Verify violation exists and belongs to this scan
    const findingContext = await this.repository.getStoredViolationContext(
      scanId,
      violationId
    );
    if (!findingContext) {
      throw new RemediationServiceError(
        `Violation with ID '${violationId}' does not belong to scan '${scanId}' or was not found.`,
        "VIOLATION_NOT_FOUND"
      );
    }

    // 3. Check for cached remediation if regeneration was not explicitly requested
    if (!regenerate) {
      const cached = await this.repository.getRemediation(scanId, violationId);
      if (cached) {
        return cached;
      }
    }

    // 4. Build prompt
    const { systemPrompt, userPrompt } = buildRemediationPrompt(findingContext);

    let result: RemediationResult;

    // 5. Attempt live Ollama inference
    try {
      const { output, model } = await this.ollamaClient.generateRemediation({
        systemPrompt,
        userPrompt,
      });

      result = {
        explanation: output.explanation,
        whyItMatters: output.whyItMatters,
        userImpact: output.userImpact,
        wcagCriteria:
          findingContext.wcagTags.length > 0
            ? findingContext.wcagTags
            : ["wcag412"],
        recommendedFix: output.recommendedFix,
        codeBefore: output.codeBefore,
        codeAfter: output.codeAfter,
        codeExplanation: output.codeExplanation,
        testingSteps: output.testingSteps,
        limitations: output.limitations,
        provider: "ollama",
        model: model || this.ollamaClient.getModel(),
        timestamp: new Date().toISOString(),
        source: "ollama",
      };
    } catch {
      // 6. Graceful deterministic fallback on any Ollama outage / timeout / schema issue
      result = generateDeterministicFallback(findingContext);
    }

    // 7. Persist completed remediation
    try {
      await this.repository.saveRemediation(scanId, violationId, result);
    } catch {
      // Persistence error should not prevent returning the computed remediation
    }

    return result;
  }
}
