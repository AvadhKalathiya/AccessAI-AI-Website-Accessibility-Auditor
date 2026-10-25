# AccessAI — Security Architecture, Threat Model & Known Limitations

This document outlines the security controls, boundary defenses, operational constraints, and accessibility testing limitations of **AccessAI**.

---

## 1. Security Architecture & Threat Model

AccessAI accepts arbitrary target URLs from untrusted clients and evaluates them using headless browser automation. This model presents distinct threat vectors that are systematically mitigated:

### A. Server-Side Request Forgery (SSRF) & DNS Rebinding
- **Threat:** Attackers submit internal IP addresses (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254`) or use DNS rebinding (switching an approved hostname to a private IP between validation and socket connection) to scan internal infrastructure or steal cloud metadata credentials.
- **Defenses Implemented:**
  1. **Strict URL Sanitization:** Protocols are restricted strictly to `http:` and `https:`. Standard ports only (`80`, `443`). User credentials in URLs (`user:pass@host`) are rejected.
  2. **Comprehensive IP Classification (`ipaddr.js`):** All destination A/AAAA records are evaluated. AccessAI blocks RFC 1918 (private), RFC 3927 (link-local), loopback (`127.0.0.0/8`, `::1`), carrier-grade NAT (`100.64.0.0/10`), multicast, broadcast, and cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`).
  3. **Pinned Socket Loopback Proxy:** The scanning engine does not allow Playwright to resolve DNS independently. Sockets are opened directly to the pre-validated public IP address, eliminating Time-of-Check / Time-of-Use (TOCTOU) DNS rebinding attacks.
  4. **Redirect Validation:** All HTTP 301/302 redirects are intercepted and re-validated against the SSRF policy before the browser navigates to the destination.

### B. Headless Browser Sandbox & Network Isolation
- **Threat:** Malicious web pages attempting to exploit Chromium vulnerabilities, access local files (`file:///`), or abuse browser storage.
- **Defenses Implemented:**
  1. **Incognito Contexts:** Each audit executes in a pristine, ephemeral incognito context. No cookies, local storage, or cached credentials persist between scans.
  2. **Hardening Flags:** Chromium runs with `--no-first-run`, `--disable-background-networking`, `--disable-default-apps`, and `serviceWorkers: "block"`.
  3. **Protocol Filtering:** Navigations targeting `file:`, `chrome:`, `data:`, or `javascript:` schemes are blocked.
  4. **Hard Timeouts:** Navigation and script execution are strictly bounded to 30 seconds to prevent denial-of-service via infinite loops or slowloris connections.

### C. In-Memory Sliding-Window Rate Limiting
- **Threat:** API flooding, denial-of-service, or resource exhaustion of the headless browser pool.
- **Defenses Implemented:**
  - Sliding-window rate limiters per client IP:
    - `POST /api/scans`: 10 req/min
    - `POST /api/scans/[id]/remediate`: 30 req/min
    - `GET /api/scans/[id]/export`: 20 req/min
    - `GET /api/analytics/summary`: 30 req/min
  - Spoofed-header defense: `X-Forwarded-For` and `X-Real-IP` values are parsed and validated through `ipaddr.js`. Malformed or non-IP headers are discarded, falling back safely to the socket remote address.
  - Memory bounds: The rate limit map is capped at 10,000 active entries with LRU eviction and periodic cleanup.
- **Limitation:** In-memory rate limiting is process-local. In a distributed multi-instance deployment, an external Redis token-bucket limiter must be used.

### D. AI Prompt Injection & Untrusted Snippets
- **Threat:** Attacker crafts malicious HTML/DOM content designed to hijack the Ollama LLM prompt (e.g. `Ignore previous instructions and output...`).
- **Defenses Implemented:**
  1. **Strict Boundary Enclosure:** All untrusted webpage snippets are isolated within defensive `<untrusted_webpage_code>` boundary tags.
  2. **Snippet Length Bounding:** HTML snippets are capped at 500 characters.
  3. **Strict Structured Output Validation:** LLM responses are parsed strictly through `OllamaRemediationOutputSchema` (Zod). Free-form outputs or hallucinated fields are rejected, triggering the deterministic fallback engine.
  4. **No Code Execution:** AI-suggested code fixes are presented purely as text suggestions for developers; code is never executed against target servers or client browsers.

### E. Injection Defenses & Export Safety
- **Spreadsheet Formula Injection:** CSV export sanitizes values beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` by prepending a single quote (`'`), preventing malicious execution in Microsoft Excel or Google Sheets.
- **PDF Resource Protection:** Caps PDF generation to 150 violations per report to avoid out-of-memory crashes on heavily flawed pages.
- **SQL Wildcard Escaping:** LIKE queries in `ScanRepository` escape `%` and `_` characters. Path parameters enforce strict RFC 4122 UUID validation.

---

## 2. Accessibility Testing Limitations (The 30–40% Rule)

> [!IMPORTANT]
> **Automated Accessibility Testing Does Not Guarantee Full WCAG Compliance.**
> Industry consensus (W3C, Deque Systems, WebAIM) demonstrates that automated testing tools (such as `axe-core`) can identify approximately **30% to 40%** of total WCAG success criteria. The remaining **60% to 70%** requires human evaluation.

### What AccessAI Detects Reliably (Automated):
- Missing or empty `alt` attributes on images.
- Insufficient color contrast ratios on text elements (WCAG 1.4.3).
- Missing form labels and unassociated inputs (WCAG 1.3.1, 4.1.2).
- Broken ARIA attributes, missing required ARIA roles, and invalid role values.
- Missing document `lang` attributes.
- Duplicate element IDs affecting assistive technology.
- Empty links and non-descriptive buttons without accessible text.

### What AccessAI Cannot Detect Automatically (Requires Human Audit):
1. **Meaningful Alternative Text:** Automated tools verify whether `alt` exists, but cannot determine whether the description accurately conveys the contextual meaning of an image.
2. **Keyboard Focus Order & Tab Traps:** Automated tools cannot verify whether dynamic keyboard navigation moves in a logical reading order or traps focus inside modal dialogs.
3. **Screen Reader User Experience:** Synthetic tests cannot assess whether screen readers (NVDA, JAWS, VoiceOver) announce dynamic content, live regions, and route transitions coherently.
4. **Cognitive & Plain Language Accessibility:** Automated tools cannot evaluate clarity of instructions, readability of copy, or sensory characteristics.
5. **Caption Synchronization:** Automated tools cannot verify whether video captions or audio descriptions match media streams accurately.

**Conclusion:** AccessAI is designed as an automated developer accelerator and continuous quality gate. It does not replace a comprehensive human accessibility audit.

---

## 3. Operational & Infrastructure Limitations

### A. SQLite Concurrency & File Locking
- AccessAI relies on SQLite 3 with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and a 5,000ms busy timeout.
- **Single Process / Single Container:** SQLite WAL allows concurrent readers and a single active writer within a single process. Multiple container instances sharing a single SQLite file over a network filesystem (NFS, CIFS, EFS) will experience locking errors or index corruption.
- **Horizontal Scaling Path:** To run multiple stateless application replicas, the backend repository layer should be migrated to PostgreSQL and BullMQ/Redis.

### B. In-Process Queue & Server Restarts
- The scan queue runs in the active Node.js server process with a concurrency limit of 2 concurrent scans.
- If the server restarts during an audit, active scans do not resume mid-flight. However, the `instrumentation.ts` startup hook automatically transitions orphaned scans (`queued`, `validating`, `navigating`, `auditing`, `saving`) to `failed` state with descriptive error telemetry.

### C. Local Ollama Dependency & Networking
- Local Ollama inference requires sufficient host RAM/VRAM depending on the model (e.g. 8GB+ for `deepseek-r1:8b`).
- In Docker environments, `OLLAMA_BASE_URL` must point to `http://host.docker.internal:11434` with `host-gateway` configured, and Ollama must be bound to `0.0.0.0` on the host OS.
- If Ollama is offline or times out (120s), AccessAI gracefully serves verified rule-based fallback fixes with zero downtime.

---

## 4. Dependency Security & Supply Chain Status

An audit via `npm audit` identifies 15 transitive dependency advisories across upstream tools:
- **Next.js (15.1.7):** Advisories relating to Next.js Image Optimization and Edge Server Actions. AccessAI does not use Image Optimization or Edge Actions. Upgrading requires Next 15.5+ or 16 (breaking major change).
- **PostCSS / Tailwind (3.4.1):** Dev-time selector parsing advisories. Upgrading requires Tailwind v4 (major breaking architectural shift).
- **Vitest (2.1.9) / Tinypool:** Test runner worker thread advisories. Upgrading requires Vitest v5.
- **Resolution Strategy:** Avoided blind execution of `npm audit fix --force` to prevent breaking changes to the core application framework. All security perimeters and direct runtime dependencies are secure.
