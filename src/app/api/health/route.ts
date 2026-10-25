import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { OllamaClient } from "@/lib/ai/ollama";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();

  // 1. Check Database Health
  let databaseStatus: "connected" | "disconnected" = "disconnected";
  try {
    const db = getDb();
    db.run(sql`SELECT 1`);
    databaseStatus = "connected";
  } catch {
    databaseStatus = "disconnected";
  }

  // 2. Check Ollama Health (fast 2000ms query to /api/tags, no generation)
  const ollamaClient = new OllamaClient();
  const ollamaHealth = await ollamaClient.checkHealth(2000);

  const isHealthy = databaseStatus === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? (ollamaHealth.reachable ? "healthy" : "degraded") : "unhealthy",
      timestamp,
      database: databaseStatus,
      scanner: "ready",
      ollama: {
        reachable: ollamaHealth.reachable,
        configuredModel: ollamaHealth.configuredModel,
        modelAvailable: ollamaHealth.modelAvailable,
        statusNote: ollamaHealth.reachable
          ? ollamaHealth.modelAvailable
            ? "Model ready for AI remediation"
            : "Model not found; run 'ollama pull " + ollamaHealth.configuredModel + "'"
          : "Ollama offline; deterministic rule-based fallback active",
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
