import { describe, expect, it } from "vitest";
import { parseClassifierJson } from "../classifier";

describe("parseClassifierJson", () => {
  it("parses a valid classification", () => {
    const result = parseClassifierJson('{"status":"Accurate","evidence":"Matches reference profile."}');
    expect(result).toEqual({ status: "Accurate", evidence: "Matches reference profile." });
  });

  it("strips a markdown code fence", () => {
    const result = parseClassifierJson('```json\n{"status":"Inaccurate","evidence":"Wrong category."}\n```');
    expect(result?.status).toBe("Inaccurate");
  });

  it("returns null for an unparseable payload rather than guessing", () => {
    expect(parseClassifierJson("not json")).toBeNull();
    expect(parseClassifierJson("")).toBeNull();
  });

  it("returns null for a disallowed status value (never invents a 5th status)", () => {
    expect(parseClassifierJson('{"status":"Confirmed","evidence":"x"}')).toBeNull();
  });

  it("defaults evidence to an empty string when missing", () => {
    const result = parseClassifierJson('{"status":"Not Recognized"}');
    expect(result).toEqual({ status: "Not Recognized", evidence: "" });
  });
});
