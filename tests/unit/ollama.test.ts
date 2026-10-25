import { describe, it, expect, vi } from "vitest";
import { OllamaClient, OllamaClientError } from "@/lib/ai/ollama";

describe("Server-side Ollama Client Suite", () => {
  const sampleValidStructuredJson = {
    explanation: "The button contains no text content or aria-label.",
    whyItMatters: "Screen reader users cannot tell what action this button will perform.",
    userImpact: "Screen readers announce only 'button' with no name or description.",
    recommendedFix: "Add an aria-label attribute or visible text to the button element.",
    codeBefore: "<button><svg></svg></button>",
    codeAfter: '<button aria-label="Close dialog"><svg></svg></button>',
    codeExplanation: "Added aria-label='Close dialog' for screen reader accessibility.",
    testingSteps: [
      "Verify with DevTools Accessibility Inspector.",
      "Test with keyboard focus and screen reader.",
    ],
    limitations: "Choose an action label appropriate to the specific button purpose.",
  };

  it("successfully parses valid structured JSON response from Ollama chat endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "llama3.2",
        message: {
          role: "assistant",
          content: JSON.stringify(sampleValidStructuredJson),
        },
      }),
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "llama3.2",
    });

    const { output, model } = await client.generateRemediation({
      systemPrompt: "System",
      userPrompt: "User",
    });

    expect(model).toBe("llama3.2");
    expect(output.explanation).toBe(sampleValidStructuredJson.explanation);
    expect(output.codeAfter).toBe(sampleValidStructuredJson.codeAfter);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("maps connection refused / network error to CONNECTION_REFUSED code", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "CONNECTION_REFUSED",
      })
    );
  });

  it("maps AbortError to TIMEOUT code", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    const mockFetch = vi.fn().mockRejectedValue(abortErr);

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      timeoutMs: 1000,
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "TIMEOUT",
      })
    );
  });

  it("maps 404 response to MODEL_NOT_FOUND code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "missing-model:latest",
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "MODEL_NOT_FOUND",
      })
    );
  });

  it("maps HTTP 500 response to HTTP_ERROR code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "HTTP_ERROR",
      })
    );
  });

  it("maps unparseable JSON to INVALID_JSON code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          role: "assistant",
          content: "Sorry, I cannot output JSON for this prompt.",
        },
      }),
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "INVALID_JSON",
      })
    );
  });

  it("maps schema-invalid JSON to SCHEMA_VALIDATION_ERROR code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          role: "assistant",
          content: JSON.stringify({
            explanation: "Short", // too short, min 10 chars
            whyItMatters: "Why", // too short
          }),
        },
      }),
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.generateRemediation({ systemPrompt: "S", userPrompt: "U" })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "SCHEMA_VALIDATION_ERROR",
      })
    );
  });

  it("checks health when model is present", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "llama3.2:latest" }, { name: "mistral:latest" }],
      }),
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "llama3.2",
    });

    const health = await client.checkHealth();
    expect(health.reachable).toBe(true);
    expect(health.modelAvailable).toBe(true);
  });

  it("checks health when Ollama is running but configured model is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "mistral:latest" }],
      }),
    });

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      model: "llama3.2",
    });

    const health = await client.checkHealth();
    expect(health.reachable).toBe(true);
    expect(health.modelAvailable).toBe(false);
  });

  it("checks health when Ollama daemon is completely offline", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const client = new OllamaClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const health = await client.checkHealth();
    expect(health.reachable).toBe(false);
    expect(health.modelAvailable).toBe(false);
  });
});
