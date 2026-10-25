import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { ScanRepository } from "@/lib/db/scan-repository";
import { POST, GET } from "@/app/api/scans/route";
import { GET as getById } from "@/app/api/scans/[id]/route";

describe("Scan API Endpoints Suite (/api/scans)", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let repository: ScanRepository;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    repository = new ScanRepository(db as any);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("POST /api/scans", () => {
    it("rejects non-JSON requests with 415 Unsupported Media Type", async () => {
      const req = new NextRequest("http://localhost:3000/api/scans", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "plain text body",
      });

      const res = await POST(req);
      expect(res.status).toBe(415);
      const json = await res.json();
      expect(json.error).toContain("Unsupported Media Type");
    });

    it("rejects invalid or missing URL in JSON body with 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("rejects loopback and private IP targets with 400 or 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:3000" }),
      });

      const res = await POST(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("rejects oversized request bodies with 413 Payload Too Large", async () => {
      const hugeBody = JSON.stringify({ url: "https://example.com", padding: "x".repeat(20000) });
      const req = new NextRequest("http://localhost:3000/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: hugeBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
    });
  });

  describe("GET /api/scans and GET /api/scans/[id]", () => {
    it("lists scans with 200 OK and pagination metadata", async () => {
      const req = new NextRequest("http://localhost:3000/api/scans?limit=5&offset=0");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.items).toBeDefined();
      expect(json.total).toBeDefined();
    });

    it("returns 404 for an unknown scan ID", async () => {
      const req = new NextRequest("http://localhost:3000/api/scans/unknown-id");
      const res = await getById(req, { params: Promise.resolve({ id: "unknown-id-12345" }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("not found");
    });
  });
});
