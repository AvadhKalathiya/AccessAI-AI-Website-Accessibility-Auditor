# AccessAI — Production Deployment Guide

This guide provides end-to-end instructions for deploying **AccessAI** to production. It covers both the **Single-Container Monolithic Architecture** (recommended for low-to-medium volume, self-hosted, and standard VPS environments) and the **Distributed Multi-Service Architecture** (recommended for high-volume enterprise deployments with serverless frontends).

---

## Architecture Comparison & Trade-Offs

| Dimension | Option A: Monolithic Container (Current Reference) | Option B: Distributed Multi-Service (Vercel + Worker) |
| :--- | :--- | :--- |
| **Ideal For** | Self-hosted VPS, Docker Compose, Railway, Render, Fly.io, AWS ECS | Enterprise scale, global edge frontend on Vercel |
| **Frontend** | Embedded Next.js 15 Standalone Server | Vercel Edge / Serverless deployment |
| **Browser Runner** | In-process Playwright Chromium (isolated contexts) | Separate Worker container (BullMQ / Redis consumer) |
| **Database** | SQLite with Write-Ahead Logging (WAL) on persistent volume | Managed PostgreSQL (Neon, Supabase, AWS RDS) |
| **Queue** | In-memory bounded semaphore / job manager | Redis + BullMQ durable job queue |
| **Complexity** | **Low** — Single container, zero external infrastructure dependencies | **Moderate/High** — Requires 4 separate managed cloud services |
| **Resource Cost** | Minimal ($5–$20/mo VPS) | Moderate ($30–$100+/mo across cloud providers) |
| **Vercel Suitability** | ⚠️ Not recommended (Vercel serverless lacks Chromium & persistent disk) | ✅ Fully compatible |

> [!IMPORTANT]
> **Why Vercel Cannot Run Option A Directly:**
> Next.js App Router API routes on Vercel execute as AWS Lambda / Vercel Serverless Functions. These functions have execution duration caps (10s on Hobby, 60s on Pro), ephemeral filesystems (where SQLite changes are lost on spin-down), and cannot reliably bundle full Playwright Chromium binaries without exceeding package size limits and risking connection abortion.

---

## Option A: Monolithic Container Deployment (Recommended)

This deployment packages the Next.js standalone application, Playwright Chromium, axe-core, and SQLite persistence into a single secure, non-root Docker container.

### 1. Prerequisites

- **Host Specifications:** Minimum 2 GB RAM (4 GB recommended for concurrent browser contexts), 2 vCPUs, 20 GB SSD.
- **Software:** Docker Engine 20.10+ and Docker Compose v2+.
- **Network:** Outbound ports 80/443 open for web scanning; inbound port 3000 (or reverse proxy port 80/443).

### 2. Environment Configuration

Create a production `.env` file on your server (never commit this file to version control):

```bash
# Node Environment
NODE_ENV=production
PORT=3000

# SQLite Persistence Directory (mapped to volume)
DATABASE_DIR=/app/data

# Scanner Security Limits
MAX_SCAN_TIMEOUT_MS=30000
SCAN_CONCURRENCY=2

# Rate Limiter
RATE_LIMIT_MAX_REQUESTS=30
RATE_LIMIT_WINDOW_MS=60000

# AI Remediation (Optional: leave default for deterministic fallback)
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3:8b
```

### 3. Docker Compose Orchestration

Use the repository's `docker-compose.yml`:

```yaml
services:
  accessai:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: accessai-production
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_DIR=/app/data
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      - OLLAMA_MODEL=${OLLAMA_MODEL:-llama3:8b}
    volumes:
      # Persistent SQLite volume surviving container rebuilds
      - accessai_data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4096M
        reservations:
          cpus: '0.5'
          memory: 1024M

volumes:
  accessai_data:
    name: accessai_production_data
```

### 4. Build and Launch Commands

```bash
# Clone the repository
git clone https://github.com/AvadhKalathiya/AccessAI-AI-Website-Accessibility-Auditor.git
cd AccessAI-AI-Website-Accessibility-Auditor

# Build and start container in detached mode
docker compose up --build -d

# Verify container status and health
docker compose ps
docker compose logs -f accessai
```

### 5. Health Check Verification

```bash
curl -I http://localhost:3000/api/health
```

Expected response:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","timestamp":"2026-10-25T17:30:00.000Z","uptime":120.4}
```

---

## Option B: Distributed Enterprise Architecture (Vercel + Worker)

If your organization mandates deploying the Next.js frontend to Vercel, adopt the following decoupled topology:

```
[ Browser / User ]
        │
        ▼ (HTTPS)
[ Vercel Edge / Next.js Frontend ] ─── (API Key) ───► [ Persistent Scan Worker ]
        │                                                     │
        ▼                                                     ├─► Playwright + axe-core
[ Managed PostgreSQL ] ◄──────────────────────────────────────┤─► Local / Remote Ollama
  (Drizzle ORM)                                               ▼
                                                       [ Redis / BullMQ ]
```

### 1. Database Layer: SQLite to PostgreSQL Migration

AccessAI uses **Drizzle ORM**, which provides seamless compatibility with PostgreSQL:

1. Update `drizzle.config.ts` to point to `postgresql`:
   ```typescript
   import { defineConfig } from 'drizzle-kit';
   export default defineConfig({
     schema: './src/lib/db/schema.ts',
     out: './drizzle/migrations',
     dialect: 'postgresql',
     dbCredentials: {
       url: process.env.DATABASE_URL!,
     },
   });
   ```
2. Replace `@libsql/client` with `postgres` or `@neondatabase/serverless` in `src/lib/db/client.ts`.
3. Execute migrations: `npx drizzle-kit migrate`.

### 2. Job Queue Layer: Redis & BullMQ

To prevent worker process memory leaks and guarantee scan delivery across worker restarts:

1. Deploy a Redis instance (Upstash Redis or AWS ElastiCache).
2. Install `bullmq`: `npm install bullmq ioredis`.
3. The Vercel frontend dispatches scan jobs:
   ```typescript
   // src/lib/queue/producer.ts
   import { Queue } from 'bullmq';
   export const scanQueue = new Queue('accessai-scans', { connection: redisConfig });
   await scanQueue.add('execute-scan', { scanId, targetUrl, options });
   ```
4. A dedicated background container running on Railway / Render / AWS ECS consumes jobs and runs Playwright.

---

## Database Backup & Maintenance

### SQLite WAL Checkpointing and Hot Backup

When using SQLite in production, the Write-Ahead Log (`accessai.db-wal`) must be safely checkpointed without interrupting active scans:

```bash
# Execute hot backup inside running container
docker exec -t accessai-production node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/accessai.db');
  db.backup('/app/data/backup-' + Date.now() + '.db')
    .then(() => console.log('Backup completed successfully'))
    .catch(err => console.error('Backup failed:', err));
"
```

### Automated Backup Cron (Host Level)

Add to host crontab (`crontab -e`):
```bash
0 2 * * * docker exec accessai-production sqlite3 /app/data/accessai.db ".backup '/app/data/daily-backup.db'" && aws s3 cp /var/lib/docker/volumes/accessai_production_data/_data/daily-backup.db s3://my-accessai-backups/$(date +\%F).db
```

---

## Security Hardening for Production

1. **Reverse Proxy (Nginx / Caddy / Cloudflare):**
   - Place AccessAI behind Nginx or Cloudflare with TLS termination and HTTP/2 enabled.
   - Enforce HTTPS redirection and HSTS (`max-age=31536000; includeSubDomains; preload`).
2. **Container Security:**
   - The production Docker image runs as `nextjs:nodejs` (UID: 1001). Never change this to `root`.
   - Security options: `security_opt: ["no-new-privileges:true"]`.
3. **SSRF Guard:**
   - AccessAI automatically blocks private IPv4 (10/8, 172.16/12, 192.168/16), loopback (127/8), link-local, AWS/GCP metadata (`169.254.169.254`), and unmaps RFC 6052 NAT64 prefixes.
   - If deploying inside AWS VPC, ensure the container cannot communicate with the instance metadata service (IMDSv2 hop limit = 1).

---

## Rollback & Zero-Downtime Updates

```bash
# Pull new release
git pull origin main

# Build new container image without bringing down service
docker compose build accessai

# Restart container with minimal downtime
docker compose up -d --no-deps accessai

# Verify health check
docker compose ps
```

If an error is detected:
```bash
# Roll back to previous git commit
git checkout HEAD~1
docker compose up -d --build accessai
```
