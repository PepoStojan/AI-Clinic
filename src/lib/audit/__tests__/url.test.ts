import { describe, expect, it } from "vitest";
import { extractRegisteredDomain, isValidHttpUrl, normalizeUrl } from "../url";

describe("isValidHttpUrl", () => {
  it("accepts http/https URLs", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://example.com/path")).toBe(true);
  });

  it("rejects non-URLs and non-http schemes", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("lowercases the host and drops the fragment and trailing slash", () => {
    expect(normalizeUrl("https://Example.COM/Path/#section")).toBe(
      "https://example.com/Path"
    );
  });

  it("keeps the root path as a single slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("produces the same result for equivalent URLs", () => {
    expect(normalizeUrl("https://Example.com/pricing/")).toBe(
      normalizeUrl("https://example.com/pricing")
    );
  });
});

describe("extractRegisteredDomain", () => {
  it("strips a leading www.", () => {
    expect(extractRegisteredDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("leaves a bare domain untouched", () => {
    expect(extractRegisteredDomain("https://example.com")).toBe("example.com");
  });

  it("lowercases the host", () => {
    expect(extractRegisteredDomain("https://EXAMPLE.com")).toBe("example.com");
  });
});
