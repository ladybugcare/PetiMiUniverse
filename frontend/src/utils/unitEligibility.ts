/**
 * Unidades em que a clínica pode operar (alinhado ao backend:
 * `demandValidationService.validateUnit` → `approved` ou `active`).
 */
export function isUnitApprovedForClinicOperations(status: string | undefined): boolean {
  if (!status) return false;
  return status === 'approved' || status === 'active';
}
