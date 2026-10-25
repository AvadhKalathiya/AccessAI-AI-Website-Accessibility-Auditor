# AccessAI — API Reference Manual

This document provides complete technical specifications for all HTTP REST and Server-Sent Event (SSE) endpoints exposed by **AccessAI**.

---

## Global Headers & Rate Limiting

### Security Headers
Every API response includes the following standard security headers configured in `next.config.ts`:
- `Content-Security-Policy`: Restricts scripts, styles, frames, and objects.
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing.
- `X-Frame-Options: DENY`: Prevents clickjacking embedding.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer leakage.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`: Disables sensitive browser APIs.

### Sliding-Window Rate Limiting
All endpoints enforce sliding-window rate limiting per client IP address. When rate limits are exceeded, the API responds with:
- **Status:** `HTTP 429 Too Many Requests`
- **Headers:** `Retry-After: <seconds>`
- **Body:** `{"error": "Too many requests. Please try again later."}`

---

## 1. POST `/api/scans`
Initiates an asynchronous accessibility audit of a target website.

- **Rate Limit:** 10 requests / minute per client IP.
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "url": "https://example.com"
  }
  ```
- **Validation Rules:**
  - Protocol must be `http:` or `https:`.
  - Port must be standard `80` or `443`.
  - Prohibits userinfo credentials (`https://user:pass@host`).
  - Destination IP must be public unicast (RFC 1918, RFC 3927, loopback, and cloud metadata IPs are rejected).

- **Success Response (`HTTP 202 Accepted`):**
  ```json
  {
    "id": "c4b9d361-9c6f-45fa-b672-0210287ad23f",
    "url": "https://example.com",
    "status": "queued",
    "createdAt": "2026-10-25T14:30:00.000Z",
    "message": "Scan queued successfully"
  }
  ```

- **Error Responses:**
  - `HTTP 400 Bad Request`: Invalid or malformed URL, unsupported protocol, or blocked SSRF IP.
  - `HTTP 429 Too Many Requests`: Client exceeded 10 scans/minute rate limit.
  - `HTTP 500 Internal Server Error`: Server failed to persist initial scan job.

---

## 2. GET `/api/scans`
Retrieves a paginated list of historical audits with optional search and status filtering.

- **Request Query Parameters:**
  | Parameter | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `page` | `integer` | No | `1` | Page number (1-indexed). |
  | `limit` | `integer` | No | `10` | Number of records per page (max 100). |
  | `status` | `string` | No | `all` | Filter by status (`queued`, `auditing`, `completed`, `failed`). |
  | `search` | `string` | No | `""` | Search by target URL domain or path. |

- **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "scans": [
      {
        "id": "c4b9d361-9c6f-45fa-b672-0210287ad23f",
        "url": "https://example.com",
        "status": "completed",
        "score": 95,
        "violationCount": 2,
        "affectedNodeCount": 3,
        "createdAt": "2026-10-25T14:30:00.000Z",
        "completedAt": "2026-10-25T14:30:08.500Z",
        "durationMs": 8500
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5
    }
  }
  ```

---

## 3. GET `/api/scans/[id]`
Fetches the complete audit report, including computed metrics, individual violations, affected DOM nodes, and cached remediation guidance.

- **Path Parameters:**
  - `id` (`string`, required): UUID of the scan record. Must conform to RFC 4122.

- **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "id": "c4b9d361-9c6f-45fa-b672-0210287ad23f",
    "url": "https://example.com",
    "status": "completed",
    "createdAt": "2026-10-25T14:30:00.000Z",
    "completedAt": "2026-10-25T14:30:08.500Z",
    "metrics": {
      "score": 95,
      "totalViolations": 2,
      "critical": 0,
      "serious": 1,
      "moderate": 1,
      "minor": 0,
      "totalElements": 142
    },
    "violations": [
      {
        "id": "e81d4a90-3b2c-4f76-8512-1a2b3c4d5e6f",
        "ruleId": "color-contrast",
        "impact": "serious",
        "description": "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum thresholds",
        "help": "Elements must meet minimum color contrast ratio thresholds",
        "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        "wcagTags": ["wcag2aa", "wcag143"],
        "nodes": [
          {
            "id": "f92e5b01-4c3d-5e87-9623-2b3c4d5e6f7a",
            "target": "p.text-muted",
            "html": "<p class=\"text-muted\">Secondary text here</p>",
            "failureSummary": "Element has insufficient color contrast of 3.2:1 (expected 4.5:1)"
          }
        ],
        "remediation": {
          "id": "a12b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
          "source": "fallback",
          "explanation": "Update the element's text color or background color to achieve a contrast ratio of at least 4.5:1.",
          "suggestedFix": ".text-muted { color: #595959; /* Contrast ratio 4.6:1 */ }",
          "diff": "- color: #888888;\n+ color: #595959;",
          "confidence": 0.95
        }
      }
    ]
  }
  ```

- **Error Responses:**
  - `HTTP 400 Bad Request`: `id` is not a valid UUID.
  - `HTTP 404 Not Found`: Scan record does not exist.

---

## 4. GET `/api/scans/[id]/progress`
Server-Sent Events (SSE) endpoint providing real-time lifecycle updates for a scan.

- **Request Headers:** `Accept: text/event-stream`
- **Response Headers:**
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

- **SSE Stream Messages:**
  ```text
  data: {"status":"validating","progress":20,"message":"Pre-validating target URL and DNS..."}

  data: {"status":"navigating","progress":40,"message":"Navigating headless browser to target..."}

  data: {"status":"auditing","progress":70,"message":"Executing axe-core accessibility engine..."}

  data: {"status":"saving","progress":90,"message":"Normalizing and persisting results..."}

  data: {"status":"completed","progress":100,"score":95,"message":"Audit complete"}
  ```

---

## 5. POST `/api/scans/[id]/remediate`
Requests an AI-powered or deterministic code remediation fix for a specific violation.

- **Rate Limit:** 30 requests / minute per client IP.
- **Request Headers:** `Content-Type: application/json`
- **Path Parameters:** `id` (UUID of the parent scan)
- **Request Body:**
  ```json
  {
    "violationId": "e81d4a90-3b2c-4f76-8512-1a2b3c4d5e6f"
  }
  ```

- **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "remediation": {
      "id": "a12b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "violationId": "e81d4a90-3b2c-4f76-8512-1a2b3c4d5e6f",
      "source": "ollama",
      "explanation": "The contrast ratio between #888888 and the white background is 3.54:1, which violates WCAG 1.4.3 Level AA (minimum 4.5:1). Darkening the text color to #595959 raises the ratio to 4.61:1.",
      "suggestedFix": "p.text-muted {\n  color: #595959;\n}",
      "diff": "- color: #888888;\n+ color: #595959;",
      "confidence": 0.98,
      "createdAt": "2026-10-25T14:30:12.000Z"
    }
  }
  ```

- **Fallback Behavior:**
  If Ollama is offline or times out (120s), the response returns with `"source": "fallback"` containing a verified deterministic template fix with guaranteed WCAG compliance.

---

## 6. GET `/api/analytics/summary`
Calculates aggregate health metrics, score trajectories, and severity distributions.

- **Rate Limit:** 30 requests / minute per client IP.
- **Request Query Parameters:**
  | Parameter | Type | Required | Default | Allowed Values |
  | :--- | :--- | :--- | :--- | :--- |
  | `range` | `string` | No | `all` | `7d`, `30d`, `90d`, `all` |

- **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "totalScans": 28,
    "averageScore": 88,
    "totalViolations": 74,
    "severityBreakdown": {
      "critical": 6,
      "serious": 22,
      "moderate": 34,
      "minor": 12
    },
    "scoreTrends": [
      { "date": "2026-10-18", "score": 82, "scans": 4 },
      { "date": "2026-10-25", "score": 91, "scans": 6 }
    ],
    "topViolations": [
      { "ruleId": "color-contrast", "count": 18, "impact": "serious" },
      { "ruleId": "image-alt", "count": 14, "impact": "critical" }
    ]
  }
  ```

---

## 7. GET `/api/scans/[id]/export`
Generates and downloads multi-format audit reports.

- **Rate Limit:** 20 requests / minute per client IP.
- **Path Parameters:** `id` (UUID of the completed scan)
- **Request Query Parameters:**
  | Parameter | Type | Required | Allowed Values | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `format` | `string` | Yes | `json`, `csv`, `pdf` | Format of exported artifact. |

- **Response Formats:**
  - `format=json`: Returns normalized scan report as `application/json` with `Content-Disposition: attachment; filename="accessai-report-:id.json"`.
  - `format=csv`: Returns RFC 4180 CSV spreadsheet as `text/csv` with `Content-Disposition: attachment; filename="accessai-report-:id.csv"`. All fields starting with `=`, `+`, `-`, or `@` are safely prefixed with `'` to prevent spreadsheet formula injection.
  - `format=pdf`: Returns professional formatted binary PDF report as `application/pdf` with `Content-Disposition: attachment; filename="accessai-report-:id.pdf"`. Max 150 violations rendered to prevent memory exhaustion.

---

## 8. GET `/api/health`
Health and readiness evaluation endpoint.

- **Rate Limit:** Unrestricted.
- **Success Response (`HTTP 200 OK`):**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-25T14:35:00.000Z",
    "uptime": 3600.42,
    "memory": {
      "rss": "112 MB",
      "heapUsed": "48 MB",
      "heapTotal": "64 MB"
    },
    "database": {
      "status": "connected"
    },
    "ollama": {
      "status": "offline",
      "baseUrl": "http://localhost:11434",
      "model": "deepseek-r1:8b"
    }
  }
  ```
- **Service Contract:** Application readiness reports `"status": "ok"` as long as the Node.js process and SQLite database are operational. Ollama status is reported independently and does not fail the readiness check.
