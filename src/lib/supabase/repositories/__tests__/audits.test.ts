import { beforeEach, describe, expect, it, vi } from "vitest";

// AUDIT-DELETE-001B: repository functions are thin wrappers around a real
// Supabase query builder -- unit-testing them means mocking that builder
// well enough to assert on the exact filter chain (.eq/.is/.in) each
// function builds, since that chain IS the safety guarantee (an atomic
// conditional UPDATE, not an app-level check). The mock below is both
// chainable (every filter method returns itself) and thenable (awaiting
// it at any point resolves the configured {data, error} result), which is
// how the real supabase-js PostgrestFilterBuilder behaves.

interface MockResult {
  data: unknown;
  error: unknown;
}

interface MockBuilder {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onFulfilled: (r: MockResult) => unknown, onRejected?: (r: unknown) => unknown) => Promise<unknown>;
}

function makeBuilder(result: MockResult): MockBuilder {
  const builder = {} as MockBuilder;
  for (const method of ["select", "update", "delete", "insert", "eq", "is", "in", "like", "order", "limit"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

let currentBuilder: MockBuilder;
const fromMock = vi.fn(() => currentBuilder);

vi.mock("../../server", () => ({
  getSupabaseServerClient: () => ({ from: fromMock }),
}));

import { getAuditById, listAudits, softDeleteAudit, updateAuditStatus } from "../audits";

const SAMPLE_ROW = { id: "audit-1", status: "BLOCKED", deleted_at: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuditById", () => {
  it("filters deleted_at IS NULL", async () => {
    currentBuilder = makeBuilder({ data: SAMPLE_ROW, error: null });
    const result = await getAuditById("audit-1");

    expect(fromMock).toHaveBeenCalledWith("audits");
    expect(currentBuilder.eq).toHaveBeenCalledWith("id", "audit-1");
    expect(currentBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(result).toBe(SAMPLE_ROW);
  });

  it("returns null for a soft-deleted (or missing) audit -- the query itself excludes it", async () => {
    currentBuilder = makeBuilder({ data: null, error: null });
    const result = await getAuditById("deleted-audit");
    expect(result).toBeNull();
  });
});

describe("listAudits", () => {
  it("filters deleted_at IS NULL and orders by created_at desc", async () => {
    currentBuilder = makeBuilder({ data: [SAMPLE_ROW], error: null });
    const result = await listAudits();

    expect(currentBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(currentBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([SAMPLE_ROW]);
  });
});

describe("updateAuditStatus", () => {
  it("conditions the UPDATE on deleted_at IS NULL, in addition to id", async () => {
    currentBuilder = makeBuilder({ data: { ...SAMPLE_ROW, status: "PROCESSING" }, error: null });
    await updateAuditStatus("audit-1", "PROCESSING");

    expect(currentBuilder.update).toHaveBeenCalledWith({ status: "PROCESSING" });
    expect(currentBuilder.eq).toHaveBeenCalledWith("id", "audit-1");
    expect(currentBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("passes through extra fields (e.g. completed_at) alongside status", async () => {
    currentBuilder = makeBuilder({ data: SAMPLE_ROW, error: null });
    await updateAuditStatus("audit-1", "COMPLETED", { completed_at: "2026-09-30T00:00:00.000Z" });

    expect(currentBuilder.update).toHaveBeenCalledWith({
      status: "COMPLETED",
      completed_at: "2026-09-30T00:00:00.000Z",
    });
  });

  it("throws (never silently no-ops) when the conditional UPDATE matches nothing -- e.g. a raced/deleted row", async () => {
    currentBuilder = makeBuilder({ data: null, error: { message: "PGRST116: no rows returned" } });
    await expect(updateAuditStatus("deleted-audit", "PROCESSING")).rejects.toThrow(/updateAuditStatus failed/);
  });
});

describe("softDeleteAudit", () => {
  it("issues a conditional UPDATE: id + deleted_at IS NULL + status IN terminal statuses", async () => {
    currentBuilder = makeBuilder({ data: { ...SAMPLE_ROW, deleted_at: "2026-09-30T00:00:00.000Z" }, error: null });
    const result = await softDeleteAudit("audit-1");

    expect(currentBuilder.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(currentBuilder.eq).toHaveBeenCalledWith("id", "audit-1");
    expect(currentBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(currentBuilder.in).toHaveBeenCalledWith("status", ["COMPLETED", "BLOCKED", "PARTIAL", "FAILED"]);
    expect(result).not.toBeNull();
  });

  it("is idempotent -- returns null (not an error) when nothing matches (already deleted)", async () => {
    currentBuilder = makeBuilder({ data: null, error: null });
    const result = await softDeleteAudit("already-deleted-audit");
    expect(result).toBeNull();
  });

  it("returns null (not an error) for a non-terminal audit -- the WHERE clause itself excludes it", async () => {
    currentBuilder = makeBuilder({ data: null, error: null });
    const result = await softDeleteAudit("processing-audit");
    expect(result).toBeNull();
  });

  it("never issues a hard delete -- only .update() is called, never .delete()", async () => {
    currentBuilder = makeBuilder({ data: SAMPLE_ROW, error: null });
    await softDeleteAudit("audit-1");
    expect(currentBuilder.delete).not.toHaveBeenCalled();
  });
});
