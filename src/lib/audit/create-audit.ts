import "server-only";

import { formatAuditCode } from "./audit-code";
import { buildChecklistItems } from "./checklist";
import { validateAuditInput, type AuditCreationInput } from "./validation";
import {
  createAudit,
  deleteAudit,
  getMaxAuditCodeSequenceForYear,
  type AuditRow,
} from "../supabase/repositories/audits";
import {
  createAuditTarget,
  listAuditTargetsByAuditId,
  type AuditTargetRow,
} from "../supabase/repositories/audit-targets";
import {
  createChecklistItems,
  listChecklistItemsByAuditId,
} from "../supabase/repositories/checklist-items";

export { AuditValidationError } from "./validation";
export type { AuditCreationInput } from "./validation";

const MAX_AUDIT_CODE_ATTEMPTS = 5;

export class AuditCreationFailedError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = "AuditCreationFailedError";
  }
}

export interface CreateAuditResult {
  auditId: string;
  auditCode: string;
  status: AuditRow["status"];
  homepageTarget: AuditTargetRow;
  additionalTargets: AuditTargetRow[];
  totalChecklistItemCount: number;
  droppedDuplicateTargetUrls: string[];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Creates the audits row with a fresh AIC-YYYY-###### code. Concurrency
 * safety is optimistic, not locked: on a unique_violation (two audits
 * racing for the same sequence number) it recomputes the next sequence and
 * retries, up to MAX_AUDIT_CODE_ATTEMPTS. Adequate for MVP conference
 * volume (~200 audits); not a distributed sequence generator.
 */
async function createAuditWithUniqueCode(
  validated: ReturnType<typeof validateAuditInput>
): Promise<AuditRow> {
  const year = new Date().getFullYear();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_AUDIT_CODE_ATTEMPTS; attempt++) {
    const sequence = (await getMaxAuditCodeSequenceForYear(year)) + 1;
    const auditCode = formatAuditCode(year, sequence);

    try {
      return await createAudit({
        audit_code: auditCode,
        contact_name: validated.contactName,
        contact_email: validated.contactEmail,
        company_name: validated.companyName,
        website_url: validated.websiteUrl,
        registered_domain: validated.registeredDomain,
        status: "CREATED",
      });
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // audit_code collision from a concurrent audit -- retry with a
      // freshly recomputed sequence.
    }
  }

  throw new AuditCreationFailedError(
    `Could not generate a unique audit code after ${MAX_AUDIT_CODE_ATTEMPTS} attempts`,
    lastError
  );
}

/**
 * Validates input, creates the audit + homepage/additional targets, and
 * generates the full deterministic checklist -- no external providers are
 * called. No real DB transaction wraps this (the Supabase JS client has no
 * multi-statement transaction API without adding a stored procedure/new DB
 * object, which is out of MVP scope). Failure safety instead relies on the
 * schema's ON DELETE CASCADE: if anything after the audits insert throws,
 * we delete the audits row, which cascades to remove any targets/checklist
 * rows already written, leaving no half-created audit behind.
 */
export async function createAuditWithChecklist(
  input: AuditCreationInput
): Promise<CreateAuditResult> {
  const validated = validateAuditInput(input); // throws AuditValidationError; no DB writes yet

  const audit = await createAuditWithUniqueCode(validated);

  try {
    const homepageTarget = await createAuditTarget({
      audit_id: audit.id,
      target_type: "homepage",
      url: validated.homepageTarget.url,
      name: validated.homepageTarget.name,
      prompts: validated.homepageTarget.prompts,
      sort_order: 0,
    });

    const additionalTargets: AuditTargetRow[] = [];
    for (const [index, target] of validated.additionalTargets.entries()) {
      const row = await createAuditTarget({
        audit_id: audit.id,
        target_type: "additional",
        url: target.url,
        name: target.name,
        prompts: target.prompts,
        sort_order: index + 1,
      });
      additionalTargets.push(row);
    }

    const totalChecklistItemCount = await generateChecklistForAudit(audit.id, [
      homepageTarget,
      ...additionalTargets,
    ]);

    return {
      auditId: audit.id,
      auditCode: audit.audit_code,
      status: audit.status,
      homepageTarget,
      additionalTargets,
      totalChecklistItemCount,
      droppedDuplicateTargetUrls: validated.droppedDuplicateTargetUrls,
    };
  } catch (error) {
    await deleteAudit(audit.id).catch(() => {
      // Best-effort cleanup; the original error is what matters to the caller.
    });
    throw new AuditCreationFailedError(
      "Audit creation failed after the audit row was created; rolled back via cascade delete.",
      error
    );
  }
}

/**
 * Generates (or re-generates) the checklist for an audit's current targets.
 * Idempotent: safe to call more than once for the same audit_id, since
 * checklist_items rows are keyed by a unique idempotency_key and inserted
 * with ignoreDuplicates -- a repeat call adds nothing new.
 */
export async function generateChecklistForAudit(
  auditId: string,
  targets: AuditTargetRow[]
): Promise<number> {
  const items = buildChecklistItems(
    auditId,
    targets.map((target) => ({
      id: target.id,
      prompts: Array.isArray(target.prompts) ? (target.prompts as string[]) : [],
    }))
  );
  await createChecklistItems(items);
  const persisted = await listChecklistItemsByAuditId(auditId);
  return persisted.length;
}

/** Convenience re-export for callers that only have an audit_id on hand. */
export async function regenerateChecklistForAudit(auditId: string): Promise<number> {
  const targets = await listAuditTargetsByAuditId(auditId);
  return generateChecklistForAudit(auditId, targets);
}
