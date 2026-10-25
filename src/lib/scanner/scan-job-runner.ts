/**
 * In-Process Scan Job Runner & Dispatcher
 *
 * Coordinates asynchronous execution of queued scans, updates database progress stages,
 * prevents duplicate execution of active jobs, bounds in-memory queue capacity,
 * and ensures safe error persistence.
 *
 * ARCHITECTURAL LIMITATIONS:
 * 1. Single-Process In-Memory Dispatcher: Jobs execute in the active Node.js server process.
 * 2. Process Restarts: An abrupt server crash will leave active scans in an uncompleted state;
 *    these are safely marked failed via ScanRepository.recoverInterruptedJobs() on boot.
 * 3. Serverless Notice: Standard serverless function environments (e.g. Vercel) terminate
 *    background promises after the HTTP response closes. A long-running Node.js process or
 *    container is required for continuous background scan execution.
 */

import { ScanRepository } from "@/lib/db/scan-repository";
import { scanWebsite, type ScanDependencies } from "@/lib/scanner/scan-website";
import type { ScanResult } from "@/lib/scanner/types";

export interface JobRunnerOptions {
  repository?: ScanRepository;
  scannerDeps?: ScanDependencies;
  maxQueueSize?: number;
}

export class ScanJobRunner {
  private repository: ScanRepository;
  private scannerDeps: ScanDependencies;
  private activeJobs = new Set<string>();
  private queuedJobs: Array<{ scanId: string; normalizedUrl: string }> = [];
  private maxQueueSize: number;
  private isProcessing = false;

  constructor(options: JobRunnerOptions = {}) {
    this.repository = options.repository || new ScanRepository();
    this.scannerDeps = options.scannerDeps || {};
    this.maxQueueSize = options.maxQueueSize || 20;
  }

  /**
   * Enqueues a scan job for asynchronous execution.
   */
  async enqueue(scanId: string, normalizedUrl: string): Promise<boolean> {
    if (this.activeJobs.has(scanId)) {
      return false; // Already executing
    }

    if (this.queuedJobs.some((j) => j.scanId === scanId)) {
      return false; // Already in queue
    }

    const totalPending = this.activeJobs.size + this.queuedJobs.length;
    if (totalPending >= this.maxQueueSize) {
      throw new Error(`Scan queue capacity exceeded (maximum ${this.maxQueueSize} waiting scans).`);
    }

    this.queuedJobs.push({ scanId, normalizedUrl });
    this.processNextJob();
    return true;
  }

  /**
   * Returns current active and waiting job counts.
   */
  getQueueStats(): { activeCount: number; waitingCount: number; maxQueueSize: number } {
    return {
      activeCount: this.activeJobs.size,
      waitingCount: this.queuedJobs.length,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Internal worker loop picking jobs from queue.
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queuedJobs.length === 0) return;

    this.isProcessing = true;

    while (this.queuedJobs.length > 0) {
      const job = this.queuedJobs.shift();
      if (!job) break;

      const { scanId, normalizedUrl } = job;
      this.activeJobs.add(scanId);

      try {
        await this.executeScan(scanId, normalizedUrl);
      } catch (err) {
        // Prevent unhandled promise rejection
        console.error(`Unhandled error executing scan ${scanId}:`, err);
      } finally {
        this.activeJobs.delete(scanId);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Executes a single scan, updating progress stages in the database.
   */
  private async executeScan(scanId: string, targetUrl: string): Promise<void> {
    const startedAt = Date.now();
    await this.repository.updateProgress(
      scanId,
      "validating",
      "validating",
      "Pre-validating target URL and security boundaries...",
      { startedAt }
    );

    let result: ScanResult;
    try {
      result = await scanWebsite(
        targetUrl,
        {
          url: targetUrl,
          onProgress: async (stage, message) => {
            await this.repository.updateProgress(scanId, stage, stage, message).catch(() => {});
          },
        },
        this.scannerDeps
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repository.recordFailure(scanId, {
        code: "INTERNAL_ERROR",
        clientMessage: "An unexpected error occurred during scan execution.",
        technicalDetails: msg,
      });
      return;
    }

    if (!result.success || result.status === "failed" || result.status === "timed_out") {
      await this.repository.recordFailure(scanId, {
        code: result.error?.code || "INTERNAL_ERROR",
        clientMessage: result.error?.clientMessage || "Scan failed.",
        technicalDetails: result.error?.technicalDetails,
      });
      return;
    }

    // Persist completed results
    await this.repository.updateProgress(scanId, "saving", "saving", "Persisting audit findings to database...");
    try {
      await this.repository.completeScan(scanId, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.repository.recordFailure(scanId, {
        code: "INTERNAL_ERROR",
        clientMessage: "Failed to persist scan results to the database.",
        technicalDetails: msg,
      });
    }
  }
}

// Global job runner singleton
declare global {
  var __accessai_job_runner__: ScanJobRunner | undefined;
}

export function getScanJobRunner(): ScanJobRunner {
  if (!global.__accessai_job_runner__) {
    global.__accessai_job_runner__ = new ScanJobRunner();
  }
  return global.__accessai_job_runner__;
}
