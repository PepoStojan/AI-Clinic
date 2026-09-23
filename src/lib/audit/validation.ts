import { extractRegisteredDomain, isValidHttpUrl, normalizeUrl } from "./url";

export interface AdditionalTargetInput {
  name?: string;
  url: string;
  prompts?: string[];
}

export interface AuditCreationInput {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  websiteUrl: string;
  productServiceName?: string;
  mainPrompts: string[];
  additionalTargets?: AdditionalTargetInput[];
}

export class AuditValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Audit input validation failed: ${issues.join("; ")}`);
    this.name = "AuditValidationError";
  }
}

export interface ValidatedTarget {
  targetType: "homepage" | "additional";
  name: string | null;
  url: string;
  prompts: string[];
}

export interface ValidatedAuditInput {
  contactName: string;
  contactEmail: string;
  companyName: string;
  websiteUrl: string;
  registeredDomain: string;
  homepageTarget: ValidatedTarget;
  additionalTargets: ValidatedTarget[];
  droppedDuplicateTargetUrls: string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dedupePrompts(prompts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of prompts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function validateAuditInput(input: AuditCreationInput): ValidatedAuditInput {
  const issues: string[] = [];

  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const companyName = input.companyName?.trim() ?? "";
  const websiteUrlRaw = input.websiteUrl?.trim() ?? "";

  if (!firstName) issues.push("First name is required.");
  if (!lastName) issues.push("Last name is required.");
  if (!email || !EMAIL_PATTERN.test(email)) issues.push("A valid email is required.");
  if (!companyName) issues.push("Company / brand name is required.");

  let normalizedWebsiteUrl: string | null = null;
  if (!websiteUrlRaw || !isValidHttpUrl(websiteUrlRaw)) {
    issues.push("A valid website URL is required.");
  } else {
    normalizedWebsiteUrl = normalizeUrl(websiteUrlRaw);
  }

  const mainPrompts = dedupePrompts(input.mainPrompts ?? []);
  if (mainPrompts.length === 0) {
    issues.push("At least one main prompt is required.");
  }

  const seenUrls = new Set<string>();
  if (normalizedWebsiteUrl) {
    seenUrls.add(normalizedWebsiteUrl);
  }

  const additionalTargets: ValidatedTarget[] = [];
  const droppedDuplicateTargetUrls: string[] = [];

  (input.additionalTargets ?? []).forEach((target, index) => {
    const rawUrl = target.url?.trim() ?? "";
    if (!rawUrl || !isValidHttpUrl(rawUrl)) {
      issues.push(`Additional target ${index + 1}: a valid URL is required.`);
      return;
    }
    const normalized = normalizeUrl(rawUrl);
    if (seenUrls.has(normalized)) {
      droppedDuplicateTargetUrls.push(normalized);
      return;
    }
    seenUrls.add(normalized);
    additionalTargets.push({
      targetType: "additional",
      name: target.name?.trim() || null,
      url: normalized,
      prompts: dedupePrompts(target.prompts ?? []),
    });
  });

  if (issues.length > 0) {
    throw new AuditValidationError(issues);
  }

  return {
    contactName: `${firstName} ${lastName}`.trim(),
    contactEmail: email,
    companyName,
    websiteUrl: normalizedWebsiteUrl!,
    registeredDomain: extractRegisteredDomain(normalizedWebsiteUrl!),
    homepageTarget: {
      targetType: "homepage",
      name: input.productServiceName?.trim() || null,
      url: normalizedWebsiteUrl!,
      prompts: mainPrompts,
    },
    additionalTargets,
    droppedDuplicateTargetUrls,
  };
}
