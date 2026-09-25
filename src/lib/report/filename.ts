// REPORT-001: deterministic, safe PDF filename derived from the company
// name. `<Company-Name>-AI-Visibility-Audit.pdf`, unsafe characters
// stripped and spaces converted to hyphens (Master Planning section 27.1,
// D-043). Never throws -- falls back to a safe generic name when the
// company name has no usable characters at all, so pre-PDF gate check
// #20 ("PDF filename can be generated safely") can never fail on this.

const FALLBACK_SLUG = "Client";

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

export function buildPdfFilename(companyName: string, dateSuffix?: string): string {
  const slug = slugify(companyName);
  const suffix = dateSuffix ? `-${dateSuffix}` : "";
  return `${slug}-AI-Visibility-Audit${suffix}.pdf`;
}
