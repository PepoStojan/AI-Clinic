// Idempotency key formula locked by the Build Spec section 9:
// audit_id + component + target + check_key

export function buildIdempotencyKey(params: {
  auditId: string;
  componentName: string;
  targetId: string | null;
  checkKey: string;
}): string {
  const { auditId, componentName, targetId, checkKey } = params;
  return [auditId, componentName, targetId ?? "none", checkKey].join(":");
}
