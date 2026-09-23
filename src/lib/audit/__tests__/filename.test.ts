import { describe, expect, it } from "vitest";
import { buildReportFilename, buildReportStoragePath } from "../filename";

describe("buildReportFilename", () => {
  it("converts spaces and punctuation to hyphens", () => {
    expect(buildReportFilename("Acme, Inc.")).toBe("Acme-Inc-AI-Visibility-Audit.pdf");
  });

  it("strips accents to plain ASCII", () => {
    expect(buildReportFilename("Café Müller")).toBe("Cafe-Muller-AI-Visibility-Audit.pdf");
  });

  it("appends an optional date suffix", () => {
    expect(buildReportFilename("Acme", "2026-09-23")).toBe(
      "Acme-AI-Visibility-Audit-2026-09-23.pdf"
    );
  });

  it("rejects an empty company name", () => {
    expect(() => buildReportFilename("   ")).toThrow();
  });
});

describe("buildReportStoragePath", () => {
  it("scopes the filename under the audit id", () => {
    expect(buildReportStoragePath("audit-1", "Acme-AI-Visibility-Audit.pdf")).toBe(
      "audit-1/Acme-AI-Visibility-Audit.pdf"
    );
  });
});
