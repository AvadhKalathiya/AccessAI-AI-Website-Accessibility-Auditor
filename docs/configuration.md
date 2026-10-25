# AccessAI — Configuration & Environment Reference

This document provides a comprehensive reference for all environment variables, runtime flags, and container networking configurations supported by **AccessAI**.

---

## 1. Supported Environment Variables

AccessAI consumes configuration via standard environment variables or a `.env` file located in the project root.

| Variable Name | Required | Default Value | Allowed Values / Format | Description |
| :--- | :---: | :--- | :--- | :--- |
| `PORT` | No | `3000` | Integer (e.g. `3000`, `8080`) | TCP port on which the Next.js HTTP server listens. |
| `NODE_ENV` | No | `development` | `development`, `production`, `test` | Sets Node.js runtime environment and optimization flags. |
| `DATABASE_URL` | No | `file:./data/accessai.db` | URI format: `file:<path>` | Path to the SQLite 3 database file. Must begin with `file:`. |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Full HTTP/HTTPS URL | Base URL for the local or remote Ollama LLM service. |
| `OLLAMA_MODEL` | No | `deepseek-r1:8b` | String (e.g. `llama3.2`, `mistral`) | Model tag to invoke for code remediation suggestions. |
| `OLLAMA_TIMEOUT_MS` | No | `120000` | Integer (milliseconds) | Maximum time to wait for LLM completion before invoking deterministic fallback. |

---

## 2. Environment Configuration Details

### `DATABASE_URL`
- **Purpose:** Specifies the location of the embedded SQLite database.
- **Format:** Must follow the Drizzle SQLite connection format: `file:<absolute_or_relative_path>`.
- **Local Development:** `file:./data/accessai.db` (stores database in project directory).
- **Docker Container:** `file:/app/data/accessai.db` (mapped to persistent named volume `accessai-data`).
- **CI / Automated Tests:** Set dynamically during test setup (`tests/setup.ts`) to `file:./data/accessai-test.db` to isolate tests from production and development data.

### `OLLAMA_BASE_URL`
- **Purpose:** Configures the endpoint for AI accessibility remediation.
- **Security Validation:** The URL is validated on initialization by `OllamaClient`. Addresses resolving to cloud metadata IPs (`169.254.169.254`) are strictly blocked.
- **Local Host:** `http://localhost:11434`
- **Docker Container:** `http://host.docker.internal:11434`
  - *Important:* Inside a Docker container, `127.0.0.1` refers to the container itself. To connect to an Ollama instance running on the host OS, you must use `host.docker.internal` paired with `extra_hosts: ["host.docker.internal:host-gateway"]` in `docker-compose.yml`.
  - Ensure Ollama is configured to bind to all interfaces on the host:
    - **Windows / macOS:** Set system environment variable `OLLAMA_HOST=0.0.0.0:11434` and restart Ollama.
    - **Linux:** Set `Environment="OLLAMA_HOST=0.0.0.0:11434"` in `/etc/systemd/system/ollama.service.d/override.conf`.

### `OLLAMA_MODEL`
- **Default:** `deepseek-r1:8b`
- **Supported Models:** Any model available in your local Ollama library with structured JSON instruction-following capabilities.
- **Recommended Models:**
  - `deepseek-r1:8b` (Default: Excellent reasoning on code snippets and WCAG rules)
  - `llama3.2:3b` (Lightweight: Low RAM/VRAM footprint, fast inference)
  - `qwen2.5-coder:7b` (Code-focused: High-fidelity CSS/HTML diff generation)
- **Model Pull Command:**
  ```bash
  ollama pull deepseek-r1:8b
  ```

### `OLLAMA_TIMEOUT_MS`
- **Default:** `120000` (120 seconds / 2 minutes)
- **Behavior:** Local LLM inference on CPUs or low-power GPUs can experience latency spikes. If Ollama does not return a response within this window, the request is aborted and AccessAI immediately returns a deterministic, rule-based fallback fix without failing the client request.

---

## 3. Configuration Profiles

### Profile A: Local Bare-Metal Development (`.env`)
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=file:./data/accessai.db
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:8b
OLLAMA_TIMEOUT_MS=120000
```

### Profile B: Containerized Production (`docker-compose.yml`)
```yaml
services:
  accessai:
    environment:
      - PORT=3000
      - NODE_ENV=production
      - DATABASE_URL=file:/app/data/accessai.db
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - OLLAMA_MODEL=deepseek-r1:8b
      - OLLAMA_TIMEOUT_MS=120000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - accessai-data:/app/data
```

### Profile C: Automated CI Pipeline (GitHub Actions)
```yaml
env:
  NODE_ENV: test
  DATABASE_URL: file:./data/accessai-test.db
  OLLAMA_BASE_URL: http://127.0.0.1:11434
  OLLAMA_TIMEOUT_MS: 5000
```

---

## 4. Configuration Security Checklist

1. **Never commit `.env` to version control:** `.env` and `.env.local` are included in `.gitignore` and `.dockerignore`.
2. **Never expose internal database credentials:** SQLite uses filesystem permissions rather than network passwords; ensure `/app/data` has restricted ownership (`node:node`, `chmod 700`).
3. **Validate Ollama URLs:** Never set `OLLAMA_BASE_URL` to an untrusted public internet domain or cloud metadata service.
