import { describe, expect, it } from "vitest";
import { DataForSeoRequestError, parseGoogleAiModeResponse, parseLlmProviderResponse } from "../dataforseo";

function llmSuccessResponse(text: string, annotations: { url: string; title?: string }[] = []) {
  return {
    tasks: [
      {
        status_code: 20000,
        cost: 0.001,
        result: [
          {
            items: [
              {
                type: "message",
                sections: [{ type: "text", text, annotations }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("DataForSeoRequestError", () => {
  it("marks 429 and 5xx as recoverable", () => {
    expect(new DataForSeoRequestError("x", true, 429).recoverable).toBe(true);
    expect(new DataForSeoRequestError("x", true, 503).recoverable).toBe(true);
  });

  it("marks other 4xx as non-recoverable", () => {
    expect(new DataForSeoRequestError("x", false, 401).recoverable).toBe(false);
    expect(new DataForSeoRequestError("x", false, 400).recoverable).toBe(false);
  });
});

describe("parseLlmProviderResponse", () => {
  it("extracts text and citations from a successful response", () => {
    const parsed = parseLlmProviderResponse(
      llmSuccessResponse("Acme Corp is a software company.", [
        { url: "https://acme.example.com", title: "Acme" },
      ])
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toBe("Acme Corp is a software company.");
    expect(parsed.citations).toEqual([
      { title: "Acme", url: "https://acme.example.com", domain: "acme.example.com" },
    ]);
  });

  it("returns No Result (not a crash) when the task status is not 20000", () => {
    const parsed = parseLlmProviderResponse({
      tasks: [{ status_code: 40000, status_message: "Bad request" }],
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.noResultReason).toContain("40000");
  });

  it("returns No Result with no citations -> caller must say 'No source provided.'", () => {
    const parsed = parseLlmProviderResponse(llmSuccessResponse("Acme Corp is a software company."));
    expect(parsed.ok).toBe(true);
    expect(parsed.citations).toEqual([]);
  });

  it("returns No Result for malformed/empty responses", () => {
    expect(parseLlmProviderResponse({}).ok).toBe(false);
    expect(parseLlmProviderResponse({ tasks: [] }).ok).toBe(false);
  });
});

describe("parseGoogleAiModeResponse", () => {
  it("returns No Result (never a negative status) when no AI Overview triggered", () => {
    const parsed = parseGoogleAiModeResponse({
      tasks: [{ status_code: 20000, result: [{ items: [] }] }],
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.noResultReason).toMatch(/AI Overview/i);
  });

  it("extracts AI Overview markdown and references when present", () => {
    const parsed = parseGoogleAiModeResponse({
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                {
                  type: "ai_overview",
                  markdown: "Acme Corp builds developer tools.",
                  references: [{ url: "https://acme.example.com", title: "Acme" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toBe("Acme Corp builds developer tools.");
    expect(parsed.citations[0].url).toBe("https://acme.example.com");
  });

  it("returns No Result when the whole result array is empty (query failed)", () => {
    const parsed = parseGoogleAiModeResponse({ tasks: [{ status_code: 20000, result: [] }] });
    expect(parsed.ok).toBe(false);
  });
});
