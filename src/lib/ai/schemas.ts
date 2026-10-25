import { z } from "zod";
import type { RemediationResult } from "./types";

/**
 * Strict Zod schema for validating the structured JSON returned by an LLM.
 * Imposes bounded lengths, array sizes, and non-executable string guarantees.
 */
export const OllamaRemediationOutputSchema = z.object({
  explanation: z
    .string()
    .min(10, "Explanation is too brief")
    .max(2000, "Explanation exceeds maximum length"),
  whyItMatters: z
    .string()
    .min(10, "Why it matters is too brief")
    .max(2000, "Why it matters exceeds maximum length"),
  userImpact: z
    .string()
    .min(5, "User impact is too brief")
    .max(2000, "User impact exceeds maximum length"),
  recommendedFix: z
    .string()
    .min(10, "Recommended fix is too brief")
    .max(3000, "Recommended fix exceeds maximum length"),
  codeBefore: z
    .string()
    .max(4000, "Code before snippet exceeds maximum length")
    .nullable()
    .optional()
    .transform((val) => val || null),
  codeAfter: z
    .string()
    .max(4000, "Code after snippet exceeds maximum length")
    .nullable()
    .optional()
    .transform((val) => val || null),
  codeExplanation: z
    .string()
    .max(2000, "Code explanation exceeds maximum length")
    .nullable()
    .optional()
    .transform((val) => val || null),
  testingSteps: z
    .array(z.string().min(5).max(600))
    .min(1, "At least one testing step is required")
    .max(8, "Too many testing steps provided"),
  limitations: z
    .string()
    .min(10, "Limitations explanation is too brief")
    .max(1500, "Limitations exceeds maximum length"),
});

export type OllamaRemediationOutput = z.infer<typeof OllamaRemediationOutputSchema>;

/**
 * Full domain schema for stored / returned RemediationResult.
 */
export const RemediationResultSchema = z.object({
  explanation: z.string().min(1).max(2500),
  whyItMatters: z.string().min(1).max(2500),
  userImpact: z.string().min(1).max(2500),
  wcagCriteria: z.array(z.string().max(50)).max(20),
  recommendedFix: z.string().min(1).max(4000),
  codeBefore: z.string().max(5000).nullable(),
  codeAfter: z.string().max(5000).nullable(),
  codeExplanation: z.string().max(2500).nullable(),
  testingSteps: z.array(z.string().max(1000)).max(15),
  limitations: z.string().min(1).max(2000),
  provider: z.string().min(1).max(100),
  model: z.string().max(100).nullable(),
  timestamp: z.string().datetime(),
  source: z.enum(["ollama", "fallback"]),
}) satisfies z.ZodType<RemediationResult>;

/**
 * Schema for incoming POST /api/scans/[id]/remediate request body.
 */
export const RemediateRequestBodySchema = z.object({
  violationId: z.string().min(1, "violationId is required").max(100),
  regenerate: z.boolean().optional().default(false),
});

export type RemediateRequestBody = z.infer<typeof RemediateRequestBodySchema>;
