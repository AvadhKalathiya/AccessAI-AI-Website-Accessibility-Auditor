# AccessAI — Engineering Portfolio & Architecture Case Study

**Project:** AccessAI — Autonomous Website Accessibility Auditor & AI Remediation Engine  
**Author / Engineer:** Senior Full-Stack & DevOps Engineer  
**Core Technologies:** Next.js 15 (App Router), React 19, TypeScript, Playwright Chromium, axe-core, SQLite (`better-sqlite3`), Drizzle ORM, Ollama, Docker, Vitest, Tailwind CSS, Recharts

---

## 1. Executive Summary & Problem Statement

Modern web applications increasingly rely on complex client-side hydration (React, Vue, Svelte) and rich dynamic components. Traditional static accessibility linters only inspect source JSX/HTML templates, failing to identify computed contrast failures, dynamic ARIA state breakdowns, and hydration-level DOM mutations. Conversely, commercial accessibility auditing platforms are expensive, proprietary, and require transmitting proprietary code and DOM snapshots to third-party cloud APIs.

**AccessAI** was engineered as an open, high-fidelity accessibility auditing and remediation platform. It pairs headless **Playwright Chromium** and the industry-standard **axe-core** engine to evaluate real client-hydrated DOM states against WCAG 2.1 Level AA and Section 508 standards. Findings are stored in an embedded relational SQLite database and paired with local, privacy-preserving AI code remediations powered by **Ollama**—backed by a deterministic, rule-based fallback engine that guarantees actionable guidance even when AI inference is offline.

---

## 2. Key Engineering Highlights & Innovations

### A. Real-DOM Headless Browser Automation
Rather than parsing static HTML strings with JSDOM, AccessAI launches an isolated headless Chromium instance via Playwright. This ensures:
- Full evaluation of client-hydrated single-page applications (SPAs).
- Accurate computed CSS styles and color contrast ratio calculations across complex layout trees and pseudo-elements.
- Isolation using ephemeral incognito contexts with disabled background networking and blocked ServiceWorkers.

### B. Defense-in-Depth SSRF & DNS Rebinding Mitigation
Accepting arbitrary user-submitted URLs creates a severe Server-Side Request Forgery (SSRF) risk. AccessAI implements a multi-barrier defense:
- **WHATWG URL Sanitization:** Enforces `http:`/`https:` protocols, standard ports (`80`, `443`), and strips credentials.
- **Pure Public-Unicast IP Filter:** Uses `ipaddr.js` to asynchronously pre-resolve DNS and reject RFC 1918 (private), RFC 3927 (link-local), loopback, carrier-grade NAT, and cloud metadata IPs (`169.254.169.254`).
- **Connection-Pinning Loopback Security Proxy:** Intercepts Playwright socket dispatches and connects directly to the pre-validated public IP address. This closes the classic Time-of-Check / Time-of-Use (TOCTOU) DNS rebinding vulnerability.

### C. Local AI Remediation with 100% Deterministic Fallback
AccessAI integrates local LLM inference (e.g. `deepseek-r1:8b` via Ollama) without sacrificing privacy or availability:
- **Zero Cloud Leakage:** Audited DOM snippets remain on the local machine or internal server.
- **Prompt Injection Defense:** Webpage snippets are bounded to 500 characters and enclosed in `<untrusted_webpage_code>` boundary tags.
- **Strict Zod Parsing:** Model responses are validated against a rigid JSON schema. Free-form text or hallucinated properties are rejected.
- **Guaranteed Availability:** If Ollama is offline, unreachable, or times out (120s), the system seamlessly generates a verified, syntax-highlighted fix from a rule-based WCAG template library.

### D. Single-Process Relational Persistence with SQLite & Drizzle ORM
- Built on `better-sqlite3` and **Drizzle ORM** with full relational mapping (`scans`, `violations`, `affected_nodes`, `scan_metrics`, `remediations`).
- WAL (Write-Ahead Logging) mode enables high-throughput concurrent reads and atomic multi-table transaction commits on scan completion.
- Server lifecycle hooks (`src/instrumentation.ts`) recover orphaned scans upon unexpected restarts and handle `SIGTERM`/`SIGINT` graceful shutdown.

### E. Multi-Format Report Exporters & Analytics
- **JSON Export:** Full normalized scan telemetry for integration into CI/CD pipelines.
- **RFC 4180 CSV Export:** Complete tabular spreadsheet with formula injection defense (mitigates CSV injection by escaping `=`, `+`, `-`, `@`).
- **PDFKit Binary PDF:** Server-side, print-ready PDF generator with visual severity badges and memory safety caps (maximum 150 violations rendered).
- **Interactive Analytics:** Accessible Recharts visualisations (Area, Bar, Donut) paired with WCAG-compliant data-table fallbacks.

---

## 3. Architecture & Data Flow Overview

```
[Auditor / User]
       |
       v
[Next.js 15 UI] ---> [Sliding-Window Rate Limiter]
                             |
                             v
              [POST /api/scans Route Handler]
                             |
                   [SSRF DNS Pre-Validator]
                             | (Approved)
                             v
              [In-Process Asynchronous Job Queue]
                             |
              +--------------+--------------+
              |                             |
              v                             v
   [Loopback Security Proxy]      [Playwright Chromium]
              |                             |
              +--------------+--------------+
                             |
                             v
                    [axe-core Analysis]
                             |
                             v
              [Result Normalizer & Scorer]
                             |
                             v
              [SQLite Database (Drizzle ORM)]
                             |
              +--------------+--------------+
              |                             |
              v                             v
    [Ollama Local LLM]            [Deterministic Fallback]
 (Strict Zod JSON Schema)         (Rule-Based WCAG Library)
```

---

## 4. Quality Assurance & Engineering Rigor

The application is backed by an automated test suite executed via **Vitest**:

| Metric | Result | Status |
| :--- | :--- | :---: |
| **Total Automated Tests** | **184 passing tests across 26 test files** | **PASS** |
| **Unit Test Coverage** | URL sanitizer, SSRF filter, axe runner, normalizer, AI prompts, Zod schemas, exporters, rate limiter | **PASS** |
| **Database Integration** | SQLite transactions, foreign key cascades, WAL mode, migrations, idempotency | **PASS** |
| **End-to-End Suite** | Full 11-step user journey from URL scan submission to AI remediation, history, analytics, and PDF download | **PASS** |
| **TypeScript Compilation** | Strict typecheck (`tsc --noEmit`) with zero errors | **PASS** |
| **ESLint Analysis** | Next.js and React 19 rulesets with zero warnings | **PASS** |
| **CI/CD Pipeline** | GitHub Actions workflow (`.github/workflows/ci.yml`) enforcing 8 automated quality gates | **PASS** |

---

## 5. Architectural Trade-offs & Engineering Decisions

1. **SQLite vs. PostgreSQL:**
   - *Decision:* Embedded SQLite with WAL mode.
   - *Rationale:* Eliminates database administration overhead for single-user/container deployments; allows atomic local transactions with microsecond query latency.
   - *Trade-off:* Constrains horizontal scaling to a single container instance.

2. **In-Process Queue vs. Redis/BullMQ:**
   - *Decision:* Single-process in-memory queue with persistent database status transitions.
   - *Rationale:* Zero external service dependencies; crash resilience handled via Next.js `instrumentation.ts` recovery hooks.
   - *Trade-off:* Scans interrupted by server crashes are marked `failed` rather than automatically re-queued.

3. **Local Ollama vs. Cloud API:**
   - *Decision:* Local Ollama inference with deterministic fallback.
   - *Rationale:* Zero operating cost; complete privacy for enterprise DOM inspection; deterministic fallback guarantees 100% service reliability.

---

## 6. Technical Skills Demonstrated

- **Full-Stack Next.js 15 & React 19:** App Router architecture, Server Components, Streaming, Server-Sent Events, Route Handlers.
- **Browser Automation & Testing:** Playwright Chromium orchestration, incognito context management, axe-core integration, DOM tree traversal.
- **Application Security & Hardening:** SSRF mitigation, connection pinning, DNS pre-validation, sliding-window rate limiting, CSP headers, formula injection defense.
- **Database Engineering:** Embedded SQLite 3, WAL journal configuration, Drizzle ORM migrations, relational foreign key cascades.
- **AI Engineering:** Local LLM integration, prompt engineering with untrusted code boundaries, Zod structured outputs, deterministic fallback engines.
- **DevOps & Production Readiness:** Multi-stage Docker builds, non-root container security, volume persistence, GitHub Actions CI/CD quality gates.
