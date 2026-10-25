# AccessAI — Autonomous Website Accessibility Auditor & AI Remediation Engine

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.7-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Chromium-red?style=flat-square&logo=playwright)](https://playwright.dev/)
[![axe-core](https://img.shields.io/badge/axe--core-4.14-green?style=flat-square)](https://github.com/dequelabs/axe-core)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-blue?style=flat-square&logo=sqlite)](https://sqlite.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-0.45-orange?style=flat-square)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Tests-184%20Passing-brightgreen?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)

AccessAI is a production-engineered, high-fidelity web accessibility testing and remediation platform designed for modern frontend engineers and accessibility auditors. 

Unlike traditional static linters that parse static templates, AccessAI orchestrates headless **Playwright Chromium** to evaluate real, client-hydrated DOM states against the industry-standard **`axe-core`** rule engine. Identified violations are persisted in an embedded **SQLite** relational database, scored against WCAG 2.1 Level AA standards, and paired with local, privacy-preserving AI code remediations via **Ollama**—backed by a deterministic, rule-based fallback engine that guarantees actionable guidance even when AI inference is offline.

---

## Current Status: Production & Portfolio Ready (Steps 1–10 Complete)

- **Completed Across Roadmap:**
  - **Step 1:** Complete repository audit, system architecture specification, and 10-phase roadmap.
  - **Step 2:** Next.js 15 App Router scaffold, strict TypeScript, accessible Tailwind design system tokens, high-contrast UI primitives (`Button`, `Card`, `Badge`, `Input`), and baseline homepage.
  - **Step 3:** WHATWG URL sanitizer (`url-sanitizer.ts`), pure public-unicast IP classification (`ssrf.ts`), and asynchronous DNS validator with fail-closed timeout logic.
  - **Step 4:** Real browser scanning engine with Playwright Chromium, outbound loopback security proxy (`outbound-proxy.ts`), isolated browser lifecycle management (`browser.ts`), supported `AxeBuilder` runner (`axe-runner.ts`), and deterministic result normalizer (`normalizer.ts`).
  - **Step 5:** Persistent relational backend with SQLite and Drizzle ORM (`scans`, `violations`, `affected_nodes`, `scan_metrics`), atomic transaction-based completion, in-process job queue, typed API route handlers (`POST /api/scans`, `GET /api/scans`, `GET /api/scans/[id]`, `GET /api/scans/[id]/progress`), and interactive report viewer.
  - **Step 6:** Server-side Ollama integration (`ollama.ts`), strict Zod structured output schema (`schemas.ts`), defensive prompt builder with untrusted snippet isolation (`prompts.ts`), deterministic rule-based fallback engine (`fallback.ts`), persistent `remediations` relational table in SQLite, `POST /api/scans/[id]/remediate` and `GET /api/health` endpoints, and interactive expandable AI remediation UI with copy-code feedback.
  - **Step 7:** Full-featured scan history dashboard (`/scans`), database-driven analytics summary (`/api/analytics/summary`) across 7d/30d/90d/all-time ranges, responsive Recharts visualisations (Area, Bar, Donut) with accessible data-table fallback, multi-format report exports (`GET /api/scans/[id]/export` for JSON, RFC 4180 CSV with formula-injection mitigation, and PDFKit binary PDF reports), client-side report violation filtering, and dedicated print styles.
  - **Step 8:** Application security hardening across all attack surfaces, sliding-window rate limiters with spoofed-header mitigation across endpoints (`POST /api/scans`, `POST /api/scans/[id]/remediate`, `GET /api/scans/[id]/export`, `GET /api/analytics/summary`), duplicate scan suppression, Ollama base URL validation and metadata SSRF blocking, strict UUID verification, SQL LIKE wildcard escaping, PDFKit memory capping, HTTP security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), and comprehensive 11-step End-to-End user journey test suite (`tests/e2e/core-user-journey.test.ts`).
  - **Step 9:** Production-grade CI/CD pipeline via GitHub Actions (`.github/workflows/ci.yml`), multi-stage production Dockerfile with non-root security and Playwright Chromium OS dependencies, docker-compose orchestration with persistent SQLite volume (`accessai-data:/app/data`), automated entrypoint migrations (`docker-entrypoint.sh`), host-to-container Ollama network bridge (`host.docker.internal`), Next.js server lifecycle instrumentation (`src/instrumentation.ts`) for crash recovery and SIGTERM/SIGINT graceful shutdown, isolated temporary database fixtures for test suites (`tests/setup.ts`), and migration integrity test suite.
  - **Step 10:** Portfolio packaging, complete technical documentation suite (`docs/`), OpenAPI-aligned API reference, architecture Mermaid diagrams, threat modeling and WCAG limitation analysis, `.editorconfig`, `.gitattributes`, `CONTRIBUTING.md`, `SECURITY.md`, and MIT license.
- **Verification:** **184 automated tests passing** across 26 test files (`npm run test`), dedicated E2E suite passing (`npm run test:e2e`), zero TypeScript compiler errors (`tsc --noEmit`), zero ESLint warnings (`next lint`), and production build passing (`next build`).

---

## Documentation Index

Comprehensive engineering guides are available in the [`docs/`](./docs) directory:

- 📐 [**System Architecture & Data Flow**](./docs/architecture.md): Deep-dive into module boundaries, trust perimeters, and 4 detailed Mermaid sequence and architecture diagrams.
- 🔌 [**API Reference Manual**](./docs/api-reference.md): Complete specifications, schemas, rate limits, and status codes for all 8 REST and SSE endpoints.
- 🛡️ [**Security Architecture & Limitations**](./docs/security-and-limitations.md): SSRF defenses, connection pinning, prompt-injection isolation, SQLite WAL limits, and the reality of automated WCAG coverage (~30–40%).
- ⚙️ [**Configuration & Environment Guide**](./docs/configuration.md): Host vs. container networking, Ollama models, timeouts, and deployment profiles.
- 💼 [**Portfolio Case Study**](./docs/portfolio-overview.md): High-level overview tailored for recruiters, hiring managers, and technical leaders.

---

## Key Differentiators & Features

| Capability | How AccessAI Solves It |
| :--- | :--- |
| **Real Client Hydration** | Evaluates real DOM execution trees and computed CSS styles via headless Playwright Chromium, catching contrast issues and ARIA breakages that static linters miss. |
| **SSRF & DNS Defense** | Enforces strict WHATWG parsing, blocks private/metadata IPs (`ipaddr.js`), and pins outbound sockets via a loopback proxy to eliminate Time-of-Check / Time-of-Use (TOCTOU) DNS rebinding. |
| **Private, Local AI Remediation** | Integrates local Ollama LLMs (e.g. `deepseek-r1:8b`). Audited webpage code never leaves the machine or enterprise perimeter. |
| **100% Deterministic Fallback** | If Ollama is offline or times out (120s), the system seamlessly generates verified, syntax-highlighted code fixes from an internal WCAG rule library. |
| **Embedded Relational Storage** | Embedded SQLite 3 with Write-Ahead Logging (`better-sqlite3` + Drizzle ORM) provides atomic multi-table commits and fast analytics without external database infrastructure. |
| **Real-Time Scan Streaming** | Server-Sent Events (SSE) stream live lifecycle transitions (`queued` -> `validating` -> `navigating` -> `auditing` -> `saving` -> `completed`) directly to the UI. |
| **Multi-Format Export Suite** | Download audit reports as machine-readable JSON, spreadsheet CSV (with formula-injection mitigation), or formatted binary PDFs via PDFKit. |
| **Interactive Analytics** | Accessible Recharts dashboard displays 7d/30d/90d score trajectories, severity distributions, and common failure frequencies with WCAG-compliant data-table fallbacks. |

---

## Technology Stack

```
Frontend:
  - Next.js 15.1.7 (App Router, Server & Client Components)
  - React 19.0.0
  - Tailwind CSS 3.4.1 (Design tokens, high-contrast accessible primitives)
  - Recharts 3.10.1 (Data visualisations with accessible fallbacks)
  - Lucide React 1.61.0 (Accessible SVG iconography)

Backend & Scanning:
  - Node.js 22 LTS
  - Playwright Chromium 1.64.1 (Isolated incognito browser execution)
  - @axe-core/playwright 4.14.0 (Accessibility rules engine)
  - PDFKit 0.20.2 (High-performance server-side PDF compilation)

AI & Remediation:
  - Ollama (Local LLM server; DeepSeek-R1, Llama 3, Qwen)
  - Zod 4.6.7 (Rigid schema validation of structured LLM JSON outputs)

Database & Storage:
  - SQLite 3 (WAL Journal Mode, Foreign Keys enabled)
  - better-sqlite3 13.0.3 (Synchronous C++ bindings for Node.js)
  - Drizzle ORM 0.45.4 & Drizzle Kit 0.31.11 (Type-safe migrations & queries)

Security & Networking:
  - ipaddr.js 2.5.0 (Strict IP classification & private subnet blocking)
  - Custom Loopback Security Proxy (Connection pinning & DNS rebinding mitigation)

Quality Assurance & DevOps:
  - Vitest 2.1.9 (Unit, database integration, and E2E test runner)
  - Docker & Docker Compose (Multi-stage non-root container deployment)
  - GitHub Actions (.github/workflows/ci.yml automated quality gates)
```

---

## Quickstart & Local Installation

### Prerequisites
- **Node.js:** v22.x LTS (tested on Node v22.19.0)
- **npm:** v10.x or higher
- *(Optional)* **Ollama:** If testing local AI remediation ([Download Ollama](https://ollama.com/))

### 1. Clone & Install
```bash
git clone https://github.com/your-username/accessai.git
cd accessai

# Clean reproducible installation
npm ci
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Default `.env` configuration:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=file:./data/accessai.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:8b
OLLAMA_TIMEOUT_MS=120000
```

### 3. Run Database Migrations
```bash
npm run db:migrate
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Docker Production Deployment

AccessAI includes a production-ready, multi-stage `Dockerfile` and `docker-compose.yml` preconfigured with non-root security, persistent volume mapping, and host-bridged Ollama access.

### 1-Command Startup with Docker Compose
```bash
# Build and run in detached mode
docker compose up -d --build

# Monitor startup logs and automated migration execution
docker compose logs -f accessai

# Verify health endpoint
curl http://localhost:3000/api/health
```

### Docker Architectural Design
- **Persistent Storage:** The database is mounted to a named volume (`accessai-data:/app/data`), ensuring scan records survive container recreations and software upgrades.
- **Automated Migrations:** `docker-entrypoint.sh` automatically runs `npm run db:migrate` on container boot before the HTTP server starts serving traffic.
- **Host Ollama Bridge:** The compose spec configures `extra_hosts: ["host.docker.internal:host-gateway"]`, allowing the container to communicate with Ollama running natively on the host OS.
- **Non-Root Execution:** Runs under dedicated unprivileged user `node` (`UID 1000:GID 1000`).

---

## Database Operations & Safe WAL Backup

> [!WARNING]
> Because SQLite operates in **WAL (Write-Ahead Logging)** mode, never use a raw filesystem copy command (`cp`) on a running database file. Use SQLite's online backup API:

### Safe Online Backup
```bash
# Local Host:
sqlite3 data/accessai.db ".backup 'data/backup-$(date +%Y%m%d%H%M%S).db'"

# Running Docker Container:
docker exec accessai sqlite3 /app/data/accessai.db ".backup '/app/data/backup-$(date +%Y%m%d%H%M%S).db'"
```

### Safe Restore Procedure
1. Stop the application to release active SQLite file locks:
   ```bash
   docker compose down
   ```
2. Remove stale `-wal` and `-shm` index files and replace the database file:
   ```bash
   rm -f data/accessai.db-wal data/accessai.db-shm
   cp data/backup-20261025.db data/accessai.db
   ```
3. Restart the container:
   ```bash
   docker compose up -d
   ```

---

## Testing & Quality Assurance

AccessAI enforces rigorous automated testing across all system layers:

```bash
# Run all 184 automated tests (unit, integration, migration)
npm run test

# Run tests in interactive watch mode
npm run test:watch

# Run the complete End-to-End user journey test
npm run test:e2e

# Run strict TypeScript typecheck
npm run typecheck

# Run ESLint validation
npm run lint

# Compile and verify the production build
npm run build

# Start the compiled production build
npm run start
```

---

## Continuous Integration Pipeline

Every push to `main` and all Pull Requests are automatically validated by our GitHub Actions workflow ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):

```
[GitHub Push / PR]
       |
       v
1. Checkout & Setup Node.js 22 (npm cache enabled)
       |
       v
2. Deterministic Dependencies: npm ci
       |
       v
3. TypeScript Typecheck: npm run typecheck
       |
       v
4. ESLint Static Analysis: npm run lint
       |
       v
5. Provision Playwright Chromium: npx playwright install --with-deps chromium
       |
       v
6. Unit & Integration Tests: npm run test (Isolated DB fixture)
       |
       v
7. End-to-End User Journey: npm run test:e2e
       |
       v
8. Next.js Production Build: npm run build
       |
       v
[Artifacts Verified & Ready for Deployment]
```

---

## Architectural Constraints & Known Limitations

1. **Single-Container Constraint:** SQLite WAL mode allows concurrent readers and a single writer within a single process. Multiple container instances sharing a single SQLite file over a network filesystem (NFS/CIFS) risk database corruption. Production deployments must run as a **single container instance**.
2. **In-Process Scan Queue:** Background scans execute within the active Node.js server process. If the server terminates unexpectedly, scans are safely recovered and marked `failed` on reboot via `src/instrumentation.ts`.
3. **Automated Accessibility Testing Scope:** Automated tools (including axe-core) catch approximately **30% to 40%** of total WCAG success criteria. Human audits are necessary for verifying logical keyboard tab order, screen reader context, dynamic focus management, and descriptive media alternatives.
4. **AI Output Verification:** AI-generated code fixes are displayed as text recommendations for developer review and testing; code is never executed automatically against target systems.

---

## Contributing & Security

- **Contributing:** Please review [CONTRIBUTING.md](./CONTRIBUTING.md) for local development workflows and code conventions.
- **Security:** Please review [SECURITY.md](./SECURITY.md) for our vulnerability disclosure policy and security boundaries.

---

## License

This project is open-source software licensed under the [MIT License](./LICENSE).
