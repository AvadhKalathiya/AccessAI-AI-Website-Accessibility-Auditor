/**
 * /api/scans/[id]/progress — Server-Sent Events (SSE) Progress Streaming
 *
 * Streams real-time scan progress updates, database status transitions,
 * and heartbeat pings to connected browser clients.
 */

import { NextRequest } from "next/server";
import { ScanRepository } from "@/lib/db/scan-repository";
import { isValidUuid } from "@/lib/security/validation";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  if (!id || id.trim().length === 0 || id.length > 100) {
    return new Response("Scan ID is required.", { status: 400 });
  }

  if (!isValidUuid(id)) {
    return new Response("Scan not found.", { status: 404 });
  }

  const repository = new ScanRepository();
  const initialScan = await repository.getScanById(id);

  if (!initialScan) {
    return new Response("Scan not found.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let timer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let lastState = "";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller might be closed
        }
      };

      // 1. Send initial current state event
      const sendCurrentState = async () => {
        try {
          const current = await repository.getScanById(id);
          if (!current) {
            sendEvent("error", { message: "Scan no longer exists." });
            controller.close();
            return;
          }

          const stateKey = `${current.status}:${current.progressStage}:${current.statusMessage}`;

          if (stateKey !== lastState) {
            lastState = stateKey;
            sendEvent("status", {
              scanId: current.id,
              status: current.status,
              progressStage: current.progressStage,
              statusMessage: current.statusMessage,
              updatedAt: current.updatedAt,
              errorCode: current.errorCode,
              errorMessage: current.errorMessage,
            });
          }

          // If scan reached terminal state, close stream
          if (current.status === "completed" || current.status === "failed") {
            sendEvent("done", {
              scanId: current.id,
              status: current.status,
            });
            if (timer) clearInterval(timer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            try {
              controller.close();
            } catch {
              // Ignore if already closed
            }
          }
        } catch (err) {
          console.error("Error in SSE progress stream:", err);
          if (timer) clearInterval(timer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {
            // Ignore
          }
        }
      };

      await sendCurrentState();

      // Poll database for state transitions every 600ms
      timer = setInterval(sendCurrentState, 600);

      // Heartbeat every 15 seconds to keep connection alive
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Ignore
        }
      }, 15000);

      // Clean up when client aborts request
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // Ignore
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable buffering in Nginx/proxies
    },
  });
}
