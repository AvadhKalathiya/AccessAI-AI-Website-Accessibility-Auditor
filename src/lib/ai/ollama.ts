import { OllamaRemediationOutputSchema, type OllamaRemediationOutput } from "./schemas";

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface OllamaHealthStatus {
  reachable: boolean;
  configuredModel: string;
  modelAvailable: boolean;
  error?: string;
}

export class OllamaClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONNECTION_REFUSED"
      | "TIMEOUT"
      | "MODEL_NOT_FOUND"
      | "HTTP_ERROR"
      | "INVALID_JSON"
      | "SCHEMA_VALIDATION_ERROR"
      | "UNKNOWN",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "OllamaClientError";
  }
}

/**
 * Server-only client for local Ollama HTTP API.
 * Uses strict timeouts, JSON schema enforcement, and non-streaming inference.
 */
export class OllamaClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: OllamaConfig = {}) {
    const rawUrl = (
      config.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      "http://127.0.0.1:11434"
    ).trim().replace(/\/+$/, "");

    // Validate URL syntax and security boundaries
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new OllamaClientError(
        `Invalid OLLAMA_BASE_URL format: '${rawUrl}'. Must be a valid HTTP/HTTPS URL.`,
        "CONNECTION_REFUSED"
      );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new OllamaClientError(
        `Unsupported OLLAMA_BASE_URL protocol: '${parsed.protocol}'. Only http: and https: are allowed.`,
        "CONNECTION_REFUSED"
      );
    }

    // Security check: Block cloud metadata endpoints from being targeted via OLLAMA_BASE_URL
    const host = parsed.hostname.toLowerCase();
    if (
      host === "169.254.169.254" ||
      host === "metadata.google.internal" ||
      host === "100.100.100.200" ||
      host.endsWith(".metadata.google.internal")
    ) {
      throw new OllamaClientError(
        `Prohibited OLLAMA_BASE_URL destination: Cloud metadata endpoint access is blocked.`,
        "CONNECTION_REFUSED"
      );
    }

    this.baseUrl = parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname);
    this.model = config.model || process.env.OLLAMA_MODEL || "llama3.2";
    this.timeoutMs = config.timeoutMs ?? 25000;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getModel(): string {
    return this.model;
  }

  /**
   * Health check query to Ollama /api/tags (non-generative).
   * Verifies if Ollama is running and whether the configured model is installed.
   */
  public async checkHealth(timeoutMs = 2000): Promise<OllamaHealthStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        return {
          reachable: true,
          configuredModel: this.model,
          modelAvailable: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const modelList = Array.isArray(data.models) ? data.models : [];
      const modelAvailable = modelList.some(
        (m) =>
          m.name === this.model ||
          m.name.startsWith(`${this.model}:`) ||
          this.model.startsWith(`${m.name}:`)
      );

      return {
        reachable: true,
        configuredModel: this.model,
        modelAvailable,
      };
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect to Ollama";
      return {
        reachable: false,
        configuredModel: this.model,
        modelAvailable: false,
        error: errorMsg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generates a structured remediation JSON using Ollama's /api/chat endpoint.
   */
  public async generateRemediation(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<{ output: OllamaRemediationOutput; model: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        model: this.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        options: {
          temperature: params.temperature ?? 0.1,
        },
      };

      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new OllamaClientError(
            `Model '${this.model}' not found in Ollama. Pull it with: ollama pull ${this.model}`,
            "MODEL_NOT_FOUND"
          );
        }
        throw new OllamaClientError(
          `Ollama API returned HTTP ${response.status}: ${response.statusText}`,
          "HTTP_ERROR"
        );
      }

      // Safe bounded response parse (5MB limit)
      let rawContent: string | undefined;
      let modelName: string | undefined;

      if (typeof response.text === "function") {
        const text = await response.text();
        if (text.length > 5 * 1024 * 1024) {
          throw new OllamaClientError(
            "Ollama response exceeded maximum allowable size limit of 5MB",
            "HTTP_ERROR"
          );
        }
        try {
          const data = JSON.parse(text) as {
            message?: { content?: string };
            model?: string;
          };
          rawContent = data.message?.content;
          modelName = data.model;
        } catch {
          throw new OllamaClientError(
            "Ollama returned invalid HTTP JSON response structure",
            "INVALID_JSON"
          );
        }
      } else if (typeof response.json === "function") {
        const data = (await response.json()) as {
          message?: { content?: string };
          model?: string;
        };
        rawContent = data.message?.content;
        modelName = data.model;
      }

      if (!rawContent || typeof rawContent !== "string") {
        throw new OllamaClientError(
          "Ollama returned empty or malformed chat content",
          "INVALID_JSON"
        );
      }

      // Parse JSON from model output
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawContent);
      } catch (jsonErr) {
        throw new OllamaClientError(
          "Model output could not be parsed as JSON: " +
            (jsonErr instanceof Error ? jsonErr.message : "Invalid JSON"),
          "INVALID_JSON",
          jsonErr
        );
      }

      // Validate against strict Zod schema
      const parseResult = OllamaRemediationOutputSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new OllamaClientError(
          `Model output failed schema validation: ${issues}`,
          "SCHEMA_VALIDATION_ERROR",
          parseResult.error
        );
      }

      return {
        output: parseResult.data,
        model: modelName || this.model,
      };
    } catch (err: unknown) {
      if (err instanceof OllamaClientError) {
        throw err;
      }

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          throw new OllamaClientError(
            `Ollama generation timed out after ${this.timeoutMs}ms`,
            "TIMEOUT",
            err
          );
        }

        const msg = err.message.toLowerCase();
        if (
          msg.includes("econnrefused") ||
          msg.includes("fetch failed") ||
          msg.includes("failed to fetch")
        ) {
          throw new OllamaClientError(
            `Connection refused to Ollama at ${this.baseUrl}. Is Ollama running?`,
            "CONNECTION_REFUSED",
            err
          );
        }
      }

      throw new OllamaClientError(
        err instanceof Error ? err.message : "Unknown error in Ollama client",
        "UNKNOWN",
        err
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
