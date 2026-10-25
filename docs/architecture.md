# AccessAI — System Architecture & Data Flow

This document details the architectural design, module boundaries, network trust perimeters, and asynchronous data pipelines of **AccessAI**.

---

## 1. High-Level System Architecture

AccessAI is built as a single-process, container-ready Next.js application that integrates headless browser orchestration, client-hydrated DOM accessibility analysis, persistent embedded relational storage, and local Large Language Model (LLM) remediation.

```mermaid
graph TB
    subgraph ClientLayer ["Client / Browser Layer"]
        User["Frontend User / Developer"]
        WebUI["Next.js 15 App Router (React 19)<br/>Tailwind CSS + Recharts"]
    end

    subgraph SecurityPerimeter ["Security & Validation Layer"]
        URLSanitizer["WHATWG URL Sanitizer<br/>(Protocol, Host, Port Filters)"]
        SSRFValidator["DNS Pre-Validator & IP Filter<br/>(RFC 1918, RFC 3927, Loopback, Metadata)"]
        RateLimiter["Sliding-Window Rate Limiter<br/>(In-Memory IP Token Buckets)"]
    end

    subgraph ServerCore ["Next.js Server Core (Node.js 22)"]
        APIRoutes["Typed Route Handlers<br/>(/api/scans, /api/health, etc.)"]
        JobRunner["In-Process Asynchronous Job Runner<br/>(Concurrency Limit: 2)"]
        Instrumentation["App Lifecycle Instrumentation<br/>(Crash Recovery & Graceful Shutdown)"]
    end

    subgraph ScannerCore ["Scanning Engine"]
        Proxy["Loopback Security Proxy<br/>(Pinned IP Sockets & TOCTOU Defense)"]
        Playwright["Playwright Chromium Browser<br/>(Incognito Context, Network Interception)"]
        AxeCore["@axe-core/playwright Engine<br/>(WCAG 2.1 AA / Section 508 Rules)"]
        Normalizer["Deterministic Normalizer<br/>(Bounded Selectors & HTML Snippets)"]
    end

    subgraph RemediationEngine ["AI & Remediation Subsystem"]
        OllamaClient["Ollama Client (Local LLM)<br/>(SSRF Blocked, DeepSeek-R1 / Llama-3)"]
        ZodValidator["Strict Zod Schema Validator<br/>(Structured JSON Output Parsing)"]
        FallbackEngine["Deterministic Rule-Based Fallback<br/>(Static WCAG Pattern Library)"]
    end

    subgraph PersistenceLayer ["Storage & Exporters"]
        SQLite[("Embedded SQLite 3 (WAL Mode)<br/>data/accessai.db")]
        Drizzle["Drizzle ORM Layer<br/>(Type-Safe Relational Queries)"]
        Exporters["Multi-Format Exporters<br/>(JSON, RFC 4180 CSV, PDFKit)"]
    end

    %% Client Interactions
    User -->|Submits URL / Views Reports| WebUI
    WebUI -->|HTTP POST / GET| RateLimiter
    RateLimiter --> APIRoutes

    %% Scan Pipeline
    APIRoutes --> URLSanitizer
    URLSanitizer --> SSRFValidator
    SSRFValidator -->|Job Enqueued| JobRunner
    JobRunner --> Proxy
    Proxy --> Playwright
    Playwright --> AxeCore
    AxeCore --> Normalizer
    Normalizer -->|Persist Scan & Violations| Drizzle
    Drizzle --> SQLite

    %% AI Pipeline
    APIRoutes -->|Remediation Request| OllamaClient
    OllamaClient -->|LLM Online| ZodValidator
    OllamaClient -.->|Timeout / Offline| FallbackEngine
    ZodValidator -->|Validated Fix| Drizzle
    FallbackEngine -->|Static Fix| Drizzle

    %% Export Pipeline
    APIRoutes -->|Download Request| Exporters
    Exporters -->|Stream Binary / Text| User

    %% Lifecycle
    Instrumentation -->|Startup Recovery & SIGTERM| SQLite
```

---

## 2. End-to-End Scanning Workflow

When an auditor or developer initiates a scan, the system transitions through a multi-stage pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant API as POST /api/scans
    participant SSRF as SSRF & URL Sanitizer
    participant DB as SQLite (Drizzle ORM)
    participant Queue as In-Process Job Queue
    participant Proxy as Outbound Security Proxy
    participant Browser as Playwright Chromium
    participant Axe as axe-core Engine

    User->>API: Submit target URL (e.g., https://example.com)
    API->>SSRF: Validate protocol, domain syntax, and resolve DNS
    alt URL or IP is private / cloud metadata / malformed
        SSRF-->>API: Reject with 400 Bad Request
        API-->>User: Return validation error
    else URL & IP are public unicast
        SSRF-->>API: Destination approved (Pinned IP recorded)
        API->>DB: Insert scan record (status = "queued")
        API->>Queue: Push job into runner queue
        API-->>User: HTTP 202 Accepted (Scan ID returned)
    end

    Note over Queue,Browser: Asynchronous Background Execution

    Queue->>DB: Update scan status = "validating" -> "navigating"
    Queue->>Proxy: Start local loopback proxy pinned to validated IP
    Queue->>Browser: Launch incognito page via proxy
    Browser->>Browser: Navigate to target URL (DOM hydrated)
    Queue->>DB: Update scan status = "auditing"
    Browser->>Axe: Inject axe-core and execute rules
    Axe-->>Queue: Raw axe violation results
    Queue->>Browser: Close page & browser context
    Queue->>Proxy: Terminate proxy listener

    Note over Queue,DB: Result Normalization & Atomic Persistence

    Queue->>Queue: Normalize violations, compute health score, truncate HTML snippets
    Queue->>DB: Atomic transaction: insert violations, affected nodes, metrics
    Queue->>DB: Update scan status = "completed"

    User->>API: GET /api/scans/:id/progress (SSE or Polling)
    API->>DB: Query current scan status
    DB-->>API: Scan completed with score & violation summary
    API-->>User: Stream real-time progress & completed report
```

---

## 3. AI Remediation & Deterministic Fallback Sequence

AccessAI guarantees that every identified violation receives an actionable, syntax-highlighted code fix—even when local LLM inference is offline or times out.

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer / Auditor
    participant API as POST /api/scans/:id/remediate
    participant Rate as Rate Limiter (30 req/min)
    participant DB as SQLite DB
    participant Ollama as Ollama API (e.g. DeepSeek-R1)
    participant Fallback as Rule-Based Fallback Engine

    User->>API: Request remediation for violationId
    API->>Rate: Check client IP rate limit
    alt Rate Limit Exceeded
        Rate-->>API: HTTP 429 Too Many Requests
        API-->>User: 429 with Retry-After header
    end

    API->>DB: Check if remediation already persisted
    alt Remediation Cached in SQLite
        DB-->>API: Return existing remediation record
        API-->>User: HTTP 200 OK (from cache)
    else Remediation Needed
        API->>DB: Fetch violation rule & affected node snippets
        DB-->>API: Rule details (selector, html, failureSummary)
        
        API->>Ollama: Check /api/tags (Health & Connectivity)
        alt Ollama Online & Model Ready
            API->>Ollama: Send bounded prompt with untrusted boundary tags
            alt Response Received within Timeout (120s)
                Ollama-->>API: JSON Structured Output
                API->>API: Validate schema with Zod (bounded lengths)
                API->>DB: Persist remediation (source = "ollama")
                API-->>User: HTTP 200 OK (AI-generated fix)
            else Inference Times Out or JSON Malformed
                API->>Fallback: Trigger deterministic fallback engine
                Fallback-->>API: WCAG standard remediation template
                API->>DB: Persist remediation (source = "fallback")
                API-->>User: HTTP 200 OK (Rule-based fallback fix)
            end
        else Ollama Offline / Network Unreachable
            API->>Fallback: Trigger deterministic fallback engine
            Fallback-->>API: WCAG standard remediation template
            API->>DB: Persist remediation (source = "fallback")
            API-->>User: HTTP 200 OK (Rule-based fallback fix)
        end
    end
```

---

## 4. CI/CD Pipeline & Quality Gates

The continuous integration pipeline in `.github/workflows/ci.yml` enforces code quality, test isolation, and reproducible compilation on every pull request and push to `main`:

```mermaid
graph TD
    Trigger([Trigger: Push / PR to main]) --> Checkout[1. Checkout Repository]
    Checkout --> NodeSetup[2. Setup Node.js 22 with npm cache]
    NodeSetup --> Install[3. Clean Install Dependencies: npm ci]
    
    subgraph QualityGates ["Automated Quality Gates"]
        Typecheck[4. TypeScript Typecheck: npm run typecheck]
        Lint[5. ESLint Analysis: npm run lint]
        Playwright[6. Playwright Chromium Provisioning: npx playwright install]
        UnitTests[7. Vitest Test Suite: npm run test<br/>Isolated Temporary DB Fixture]
        E2ETests[8. End-to-End Suite: npm run test:e2e<br/>Full 11-Step User Journey]
        Build[9. Production Build: npm run build<br/>Next.js 15 App Prerender]
    end

    Install --> Typecheck
    Typecheck --> Lint
    Lint --> Playwright
    Playwright --> UnitTests
    UnitTests --> E2ETests
    E2ETests --> Build

    subgraph ArtifactCollection ["Failure Diagnostics"]
        Upload[10. Upload Artifacts on Failure<br/>Playwright Traces & Test Logs]
    end

    Build -.->|On Failure| Upload
    UnitTests -.->|On Failure| Upload
    E2ETests -.->|On Failure| Upload

    Build --> DeployReady([Artifact Verified & Release Ready])
```

---

## 5. Trust Boundaries & Security Architecture

AccessAI evaluates arbitrary, third-party internet websites. This requires strict defense-in-depth across multiple system boundaries:

```
+-------------------------------------------------------------------------+
| UNTRUSTED EXTERNAL ZONE                                                 |
| - Target Websites (Arbitrary HTML, JavaScript, Redirects, DNS servers)  |
+-------------------------------------------------------------------------+
                                    |
                    [ 1. URL & Protocol Filter ]
                                    v
+-------------------------------------------------------------------------+
| SECURITY BOUNDARY: WHATWG Sanitizer & SSRF Resolver                     |
| - Strict http:/https: protocols only                                    |
| - Prohibits userinfo credentials (user:pass@host)                       |
| - Restricts ports to standard 80 and 443                                |
| - Asynchronous DNS pre-resolution via dns.promises.lookup               |
| - IP classification (ipaddr.js): blocks private, loopback, metadata     |
+-------------------------------------------------------------------------+
                                    |
                    [ 2. Pinned IP Outbound Socket ]
                                    v
+-------------------------------------------------------------------------+
| SECURITY BOUNDARY: Loopback Security Proxy                              |
| - Intercepts all Playwright browser socket connections                  |
| - Connects directly to pinned IP (mitigates TOCTOU DNS rebinding)       |
| - Evaluates all HTTP 3xx redirect destinations before traversal         |
+-------------------------------------------------------------------------+
                                    |
                    [ 3. Isolated Incognito Context ]
                                    v
+-------------------------------------------------------------------------+
| EXECUTION BOUNDARY: Headless Playwright Chromium                        |
| - Incognito session (no persistent cookies or storage)                  |
| - Flags: --no-first-run, --disable-background-networking                |
| - Blocks ServiceWorkers, WebSockets, and non-HTTP protocols             |
| - Hard navigation timeout: 30 seconds                                   |
+-------------------------------------------------------------------------+
                                    |
                    [ 4. Bounded Snippet Sanitization ]
                                    v
+-------------------------------------------------------------------------+
| TRUSTED INTERNAL APPLICATION ZONE                                       |
| - Snippet truncation (max 500 characters per affected node)             |
| - Prompt boundary tagging: <untrusted_webpage_code>                     |
| - Strict Zod validation on all AI outputs                               |
| - Embedded SQLite database with foreign keys & WAL mode                 |
| - Formula injection mitigation on CSV exports                           |
+-------------------------------------------------------------------------+
```

---

## 6. Architectural Trade-offs & Design Decisions

| Decision | Selected Approach | Alternatives Considered | Rationale |
| :--- | :--- | :--- | :--- |
| **Database** | Embedded SQLite 3 via `better-sqlite3` and Drizzle ORM | PostgreSQL / MySQL | Zero external infrastructure overhead for single-user and local dev; atomic transactions; fast queries; native WAL mode supports concurrent reads. |
| **Job Queue** | Single-process in-memory queue with DB state tracking | Redis + BullMQ / Celery | Eliminates external Redis dependency. Interrupted jobs are recovered on startup via `ScanRepository.recoverInterruptedJobs()`. |
| **Browser Runner** | Playwright Chromium with `@axe-core/playwright` | Puppeteer / JSDOM / Selenium | JSDOM cannot evaluate client-side React/Vue hydration or computed CSS contrast; Playwright provides robust process isolation and cross-platform reliability. |
| **AI Remediation** | Local Ollama with deterministic rule-based fallback | Cloud APIs (OpenAI / Anthropic) | Zero API key costs; strict privacy (audited DOM snippets never leave the host); offline reliability guaranteed by fallback engine. |
| **Report Generation** | PDFKit + CSV stringifier + JSON formatter | Browser `page.pdf()` printing | Server-side PDF generation via PDFKit requires no additional browser instances, reducing memory consumption by over 80%. |
