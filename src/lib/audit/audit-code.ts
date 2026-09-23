// Human-readable audit code format locked by the Build Spec: AIC-YYYY-######
const AUDIT_CODE_PATTERN = /^AIC-(\d{4})-(\d{6})$/;

export function formatAuditCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new Error(`Invalid audit code year: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new Error(`Invalid audit code sequence: ${sequence}`);
  }
  return `AIC-${year}-${String(sequence).padStart(6, "0")}`;
}

export function isValidAuditCode(code: string): boolean {
  return AUDIT_CODE_PATTERN.test(code);
}
