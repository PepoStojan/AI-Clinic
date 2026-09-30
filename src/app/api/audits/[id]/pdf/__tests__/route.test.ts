import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/repositories/audits", () => ({
  getAuditById: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/reports", () => ({
  getLatestReport: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  getReportSignedUrl: vi.fn(),
}));

import { getAuditById } from "@/lib/supabase/repositories/audits";
import { getLatestReport } from "@/lib/supabase/repositories/reports";
import { getReportSignedUrl } from "@/lib/supabase/storage";
import { GET } from "../route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/audits/[id]/pdf", () => {
  // AUDIT-DELETE-001B: this route previously queried `reports` directly and
  // never consulted `audits` at all -- a deleted audit's PDF was still
  // downloadable. This is the regression test for that fix.
  it("returns 404 without ever calling getLatestReport when the audit doesn't exist (soft-deleted)", async () => {
    vi.mocked(getAuditById).mockResolvedValue(null);

    const response = await GET(new Request("http://test/x"), paramsFor("deleted-audit"));

    expect(response.status).toBe(404);
    expect(getLatestReport).not.toHaveBeenCalled();
    expect(getReportSignedUrl).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when the audit exists but has no generated report", async () => {
    vi.mocked(getAuditById).mockResolvedValue({ id: "audit-1" } as never);
    vi.mocked(getLatestReport).mockResolvedValue({ status: "DRAFT", pdf_storage_path: null } as never);

    const response = await GET(new Request("http://test/x"), paramsFor("audit-1"));

    expect(response.status).toBe(404);
    expect(getReportSignedUrl).not.toHaveBeenCalled();
  });

  it("redirects to a signed URL for an existing audit with a generated PDF", async () => {
    vi.mocked(getAuditById).mockResolvedValue({ id: "audit-1" } as never);
    vi.mocked(getLatestReport).mockResolvedValue({
      status: "GENERATED",
      pdf_storage_path: "audit-1/report.pdf",
    } as never);
    vi.mocked(getReportSignedUrl).mockResolvedValue("https://signed.example/report.pdf");

    const response = await GET(new Request("http://test/x"), paramsFor("audit-1"));

    expect(getReportSignedUrl).toHaveBeenCalledWith("audit-1/report.pdf");
    expect(response.status).toBe(307); // NextResponse.redirect default
    expect(response.headers.get("location")).toBe("https://signed.example/report.pdf");
  });
});
