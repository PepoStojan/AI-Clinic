import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/repositories/reports", () => ({
  getLatestReport: vi.fn(),
  updateReport: vi.fn(),
}));
vi.mock("../../supabase/storage", () => ({
  uploadReportPdf: vi.fn(),
}));
vi.mock("../render-pdf", () => ({
  renderHtmlToPdf: vi.fn(),
}));
vi.mock("../html-template", () => ({
  buildReportHtml: vi.fn(() => "<html></html>"),
}));

import { getLatestReport, updateReport } from "../../supabase/repositories/reports";
import { uploadReportPdf } from "../../supabase/storage";
import { renderHtmlToPdf } from "../render-pdf";
import { buildReportHtml } from "../html-template";
import { PdfGenerationBlockedError, runPdfGeneration } from "../run-pdf-generation";

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    audit_id: "audit-1",
    report_version: 1,
    canonical_report_json: { audit_info: { company_name: "Acme" } },
    pre_pdf_checklist_json: [],
    ready_for_pdf: true,
    blocking_reasons: [],
    pdf_storage_path: null,
    status: "READY",
    generated_at: null,
    created_at: "",
    ...overrides,
  };
}

describe("runPdfGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateReport).mockImplementation(async (id, patch) => ({ ...reportRow(), id, ...patch }) as never);
    vi.mocked(renderHtmlToPdf).mockResolvedValue(Buffer.from("PDF_BYTES"));
    vi.mocked(uploadReportPdf).mockResolvedValue(undefined);
  });

  it("1. ready_for_pdf=false -> generation blocked with a deterministic error, never attempts to render", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow({ ready_for_pdf: false, blocking_reasons: ["Component(s) not completed: directories."] }) as never);

    await expect(runPdfGeneration("audit-1")).rejects.toThrow(PdfGenerationBlockedError);
    expect(renderHtmlToPdf).not.toHaveBeenCalled();
    expect(uploadReportPdf).not.toHaveBeenCalled();
  });

  it("carries the exact blocking reasons on the thrown error", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow({ ready_for_pdf: false, blocking_reasons: ["reason A", "reason B"] }) as never);
    try {
      await runPdfGeneration("audit-1");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PdfGenerationBlockedError);
      expect((error as PdfGenerationBlockedError).blockingReasons).toEqual(["reason A", "reason B"]);
    }
  });

  it("2/3. ready_for_pdf=true -> HTML is generated from the canonical_report_json only", async () => {
    const row = reportRow({ canonical_report_json: { audit_info: { company_name: "Acme" }, marker: "unique-content" } });
    vi.mocked(getLatestReport).mockResolvedValue(row as never);

    await runPdfGeneration("audit-1");

    expect(buildReportHtml).toHaveBeenCalledWith(row.canonical_report_json);
  });

  it("5/6. a PDF buffer is generated and uploaded to the expected path", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow() as never);
    await runPdfGeneration("audit-1");

    expect(renderHtmlToPdf).toHaveBeenCalledWith("<html></html>");
    expect(uploadReportPdf).toHaveBeenCalledWith("audit-1/report.pdf", Buffer.from("PDF_BYTES"));
  });

  it("7. report status transitions READY -> GENERATING -> GENERATED", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow({ status: "READY" }) as never);
    await runPdfGeneration("audit-1");

    const statusUpdates = vi.mocked(updateReport).mock.calls.map((c) => c[1].status);
    expect(statusUpdates).toEqual(["GENERATING", "GENERATED"]);
  });

  it("final update sets pdf_storage_path and generated_at", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow() as never);
    const result = await runPdfGeneration("audit-1");
    expect(result.pdf_storage_path).toBe("audit-1/report.pdf");
    expect(result.generated_at).not.toBeNull();
  });

  it("8. a rendering failure -> status FAILED, error propagates", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow() as never);
    vi.mocked(renderHtmlToPdf).mockRejectedValue(new Error("chromium crashed"));

    await expect(runPdfGeneration("audit-1")).rejects.toThrow("chromium crashed");
    const statusUpdates = vi.mocked(updateReport).mock.calls.map((c) => c[1].status);
    expect(statusUpdates).toEqual(["GENERATING", "FAILED"]);
  });

  it("an upload failure also -> status FAILED", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow() as never);
    vi.mocked(uploadReportPdf).mockRejectedValue(new Error("storage unavailable"));

    await expect(runPdfGeneration("audit-1")).rejects.toThrow("storage unavailable");
    const statusUpdates = vi.mocked(updateReport).mock.calls.map((c) => c[1].status);
    expect(statusUpdates).toEqual(["GENERATING", "FAILED"]);
  });

  it("17. regenerating (rerun) writes to the SAME deterministic storage path every time", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(reportRow() as never);
    await runPdfGeneration("audit-1");
    await runPdfGeneration("audit-1");

    const paths = vi.mocked(uploadReportPdf).mock.calls.map((c) => c[0]);
    expect(paths).toEqual(["audit-1/report.pdf", "audit-1/report.pdf"]);
  });

  it("no report found for the audit -> a clear error, not a silent no-op", async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);
    await expect(runPdfGeneration("missing-audit")).rejects.toThrow(/no report found/);
  });
});
