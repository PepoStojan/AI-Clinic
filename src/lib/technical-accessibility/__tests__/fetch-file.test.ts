import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTextFile } from "../fetch-file";

const originalFetch = global.fetch;

describe("fetchTextFile", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("9. HTTP 200 with a readable body -> found", async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response("User-agent: *\nAllow: /\n", { status: 200 }));
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("found");
    expect(result.body).toContain("Allow: /");
  });

  it("10. HTTP 404 -> not_found, never treated as an error", async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response("", { status: 404 }));
    const result = await fetchTextFile("https://example.com/llms.txt");
    expect(result.outcome).toBe("not_found");
    expect(result.body).toBeNull();
  });

  it("HTTP 403 -> cannot_verify, and is never retried", async () => {
    const fetchMock = vi.mocked(global.fetch).mockResolvedValue(new Response("", { status: 403 }));
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("cannot_verify");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on 403
  });

  it("7/11. network failure (all retries exhausted) -> cannot_verify, never Blocked", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("network down"));
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("cannot_verify");
  });

  it("5xx is retried up to the policy limit, then cannot_verify", async () => {
    const fetchMock = vi.mocked(global.fetch).mockResolvedValue(new Response("", { status: 503 }));
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("cannot_verify");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("a transient failure that recovers on retry still succeeds", async () => {
    let call = 0;
    vi.mocked(global.fetch).mockImplementation(async () => {
      call += 1;
      if (call === 1) return new Response("", { status: 503 });
      return new Response("User-agent: *\nDisallow: /admin\n", { status: 200 });
    });
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("found");
  });

  it("8. an unreadable body on an otherwise-200 response -> cannot_verify", async () => {
    const badResponse = new Response("ok", { status: 200 });
    vi.spyOn(badResponse, "text").mockRejectedValue(new Error("stream error"));
    vi.mocked(global.fetch).mockResolvedValue(badResponse);
    const result = await fetchTextFile("https://example.com/robots.txt");
    expect(result.outcome).toBe("cannot_verify");
  });
});
