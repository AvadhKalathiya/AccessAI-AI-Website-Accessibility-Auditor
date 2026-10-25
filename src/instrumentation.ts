/**
 * Next.js Server Lifecycle Instrumentation Hook
 *
 * Automatically invoked once on server startup by Next.js App Router (Node.js runtime).
 * Coordinates:
 * 1. Crash recovery: marks any scans interrupted by previous crashes as failed.
 * 2. Process termination signals (SIGTERM, SIGINT): flushes and safely closes SQLite database connections.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ScanRepository } = await import("@/lib/db/scan-repository");
    const { closeDb } = await import("@/lib/db");

    try {
      const repository = new ScanRepository();
      const recoveredCount = await repository.recoverInterruptedJobs();
      if (recoveredCount > 0) {
        console.log(
          `[AccessAI Server] Recovered ${recoveredCount} interrupted scan(s) from previous server shutdown.`
        );
      }
    } catch (err) {
      console.error("[AccessAI Server] Failed to recover interrupted scans on startup:", err);
    }

    // Register process shutdown hooks for safe SQLite WAL checkpointing
    const handleShutdown = (signal: string) => {
      console.log(`[AccessAI Server] ${signal} received. Closing database connections gracefully...`);
      closeDb();
      process.exit(0);
    };

    process.once("SIGTERM", () => handleShutdown("SIGTERM"));
    process.once("SIGINT", () => handleShutdown("SIGINT"));
  }
}
