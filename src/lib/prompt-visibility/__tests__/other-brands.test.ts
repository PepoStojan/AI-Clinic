import { beforeEach, describe, expect, it, vi } from "vitest";
import { groundBrands } from "../other-brands";

vi.mock("../../providers/dataforseo", async () => {
  const actual = await vi.importActual<typeof import("../../providers/dataforseo")>("../../providers/dataforseo");
  return {
    ...actual,
    postDataForSeoWithRetry: vi.fn(),
  };
});

import { postDataForSeoWithRetry } from "../../providers/dataforseo";
import { extractOtherBrands } from "../other-brands";

function dataForSeoResponse(text: string) {
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
                sections: [{ type: "text", text }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("groundBrands (deterministic source grounding)", () => {
  const responseText = "Eyefinity and RevolutionEHR are popular choices for optical practice management.";

  it("keeps candidates that literally appear in the response text", () => {
    expect(groundBrands(["Eyefinity", "RevolutionEHR"], responseText, "Ocuco")).toEqual(["Eyefinity", "RevolutionEHR"]);
  });

  it("drops a hallucinated brand absent from the response text", () => {
    expect(groundBrands(["Eyefinity", "TotallyMadeUpBrand"], responseText, "Ocuco")).toEqual(["Eyefinity"]);
  });

  it("keeps only grounded entries from a grounded + hallucinated mix", () => {
    const result = groundBrands(["TotallyMadeUpBrand", "Eyefinity", "AnotherFakeBrand", "RevolutionEHR"], responseText, "Ocuco");
    expect(result).toEqual(["Eyefinity", "RevolutionEHR"]);
  });

  it("returns [] when nothing is grounded", () => {
    expect(groundBrands(["FakeOne", "FakeTwo"], responseText, "Ocuco")).toEqual([]);
  });

  it("removes the target brand even if the model returns it", () => {
    const text = "Ocuco and Eyefinity are both mentioned here.";
    expect(groundBrands(["Ocuco", "Eyefinity"], text, "Ocuco")).toEqual(["Eyefinity"]);
  });

  it("dedupes case-insensitively", () => {
    const text = "Eyefinity is great. eyefinity is also great.";
    expect(groundBrands(["Eyefinity", "eyefinity", "EYEFINITY"], text, "Ocuco")).toEqual(["Eyefinity"]);
  });

  it("caps at 5 even when more grounded candidates are supplied", () => {
    const brands = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
    const text = brands.join(", ") + " were all discussed.";
    const result = groundBrands(brands, text, "Ocuco");
    expect(result).toHaveLength(5);
    expect(result).toEqual(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);
  });

  it("drops empty/whitespace-only candidates", () => {
    const text = "Eyefinity is mentioned.";
    expect(groundBrands(["", "   ", "Eyefinity"], text, "Ocuco")).toEqual(["Eyefinity"]);
  });
});

describe("extractOtherBrands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns grounded brands on a valid, well-formed model response", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: dataForSeoResponse('{"brands":["Eyefinity","RevolutionEHR","ModMed"]}'),
      attempts: 1,
    });

    const result = await extractOtherBrands(
      "Ocuco",
      "For optical practice management, Eyefinity, RevolutionEHR, and ModMed are commonly recommended."
    );

    expect(result).toEqual(["Eyefinity", "RevolutionEHR", "ModMed"]);
  });

  it("returns [] on malformed JSON from the model", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: dataForSeoResponse("not valid json at all"),
      attempts: 1,
    });

    const result = await extractOtherBrands("Ocuco", "Eyefinity is mentioned here.");
    expect(result).toEqual([]);
  });

  it("returns [] when the brands field is missing or not an array", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: dataForSeoResponse('{"something_else": true}'),
      attempts: 1,
    });

    const result = await extractOtherBrands("Ocuco", "Eyefinity is mentioned here.");
    expect(result).toEqual([]);
  });

  it("returns [] on provider failure/exception", async () => {
    vi.mocked(postDataForSeoWithRetry).mockRejectedValue(new Error("simulated provider outage"));

    const result = await extractOtherBrands("Ocuco", "Eyefinity is mentioned here.");
    expect(result).toEqual([]);
  });

  it("returns [] when the provider task itself failed (parsed.ok === false)", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: { tasks: [{ status_code: 40000, status_message: "error", result: [] }] },
      attempts: 1,
    });

    const result = await extractOtherBrands("Ocuco", "Eyefinity is mentioned here.");
    expect(result).toEqual([]);
  });

  it("removes a hallucinated brand not present in the response text end-to-end", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: dataForSeoResponse('{"brands":["Eyefinity","TotallyMadeUpBrand"]}'),
      attempts: 1,
    });

    const result = await extractOtherBrands("Ocuco", "Eyefinity is a strong alternative.");
    expect(result).toEqual(["Eyefinity"]);
  });

  it("returns [] for an empty responseText without calling the provider", async () => {
    const result = await extractOtherBrands("Ocuco", "");
    expect(result).toEqual([]);
    expect(postDataForSeoWithRetry).not.toHaveBeenCalled();
  });

  it("caps an unusually long target brand name so the prompt still carries response text", async () => {
    vi.mocked(postDataForSeoWithRetry).mockResolvedValue({
      json: dataForSeoResponse('{"brands":["Eyefinity"]}'),
      attempts: 1,
    });

    const longBrandName = "A".repeat(400); // far larger than the 500-char total prompt budget
    const responseText = "Some filler text. ".repeat(20) + "Eyefinity is a strong alternative here.";

    await extractOtherBrands(longBrandName, responseText);

    expect(postDataForSeoWithRetry).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(postDataForSeoWithRetry).mock.calls[0][1] as Array<{ user_prompt: string }>;
    const userPrompt = payload[0].user_prompt;

    expect(userPrompt.length).toBeLessThanOrEqual(500);
    // The EXCLUDE prefix must not consume the whole budget -- meaningful
    // response text must still be present in the prompt.
    expect(userPrompt).toContain("RESPONSE:");
    const responsePortion = userPrompt.slice(userPrompt.indexOf("RESPONSE:") + "RESPONSE:".length);
    expect(responsePortion.length).toBeGreaterThanOrEqual(300);
  });
});
