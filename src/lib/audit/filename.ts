// Filename pattern locked by the Build Spec section 11:
// <Company-Name>-AI-Visibility-Audit.pdf
// <Company-Name>-AI-Visibility-Audit-YYYY-MM-DD.pdf

function normalizeCompanyNameSegment(companyName: string): string {
  const trimmed = companyName.trim();
  if (trimmed.length === 0) {
    throw new Error("companyName must not be empty");
  }

  return trimmed
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildReportFilename(companyName: string, dateSuffix?: string): string {
  const safeCompany = normalizeCompanyNameSegment(companyName);
  const suffix = dateSuffix ? `-${dateSuffix}` : "";
  return `${safeCompany}-AI-Visibility-Audit${suffix}.pdf`;
}

export function buildReportStoragePath(auditId: string, filename: string): string {
  return `${auditId}/${filename}`;
}
