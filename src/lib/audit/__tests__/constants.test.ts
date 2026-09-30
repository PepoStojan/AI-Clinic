import { describe, expect, it } from "vitest";
import { TERMINAL_AUDIT_STATUSES, isTerminalAuditStatus } from "../constants";

// AUDIT-DELETE-001B: this is the canonical home for the terminal-status
// business rule (moved out of src/lib/ui/audit-progress.ts so repository/
// server code doesn't need to depend on the UI layer). The UI module
// re-exports isTerminalAuditStatus from here -- see
// src/lib/ui/__tests__/audit-progress.test.ts for the pre-existing
// coverage of that re-export, unchanged by this move.

describe("TERMINAL_AUDIT_STATUSES", () => {
  it("is exactly the 4 statuses eligible for soft delete", () => {
    expect([...TERMINAL_AUDIT_STATUSES].sort()).toEqual(["BLOCKED", "COMPLETED", "FAILED", "PARTIAL"]);
  });
});

describe("isTerminalAuditStatus", () => {
  it("is true for every terminal status", () => {
    expect(isTerminalAuditStatus("COMPLETED")).toBe(true);
    expect(isTerminalAuditStatus("BLOCKED")).toBe(true);
    expect(isTerminalAuditStatus("PARTIAL")).toBe(true);
    expect(isTerminalAuditStatus("FAILED")).toBe(true);
  });

  it("is false for every non-terminal status", () => {
    expect(isTerminalAuditStatus("CREATED")).toBe(false);
    expect(isTerminalAuditStatus("QUEUED")).toBe(false);
    expect(isTerminalAuditStatus("PROCESSING")).toBe(false);
    expect(isTerminalAuditStatus("VALIDATING")).toBe(false);
    expect(isTerminalAuditStatus("READY_FOR_PDF")).toBe(false);
    expect(isTerminalAuditStatus("GENERATING_PDF")).toBe(false);
  });

  it("is false for an unrecognized status string", () => {
    expect(isTerminalAuditStatus("SOMETHING_ELSE")).toBe(false);
  });
});
