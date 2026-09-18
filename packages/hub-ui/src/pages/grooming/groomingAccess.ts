import type { AppRole } from '@petimi/web-core';

/** Tosador / CSTAFF de chão — operação no celular (Minha fila), como o motorista no Leva e Traz. */
export function isGroomingFloorStaff(
  role: AppRole | string | null | undefined,
  hasAppointmentsWrite: boolean,
): boolean {
  return role === 'CGROOMER' || (role === 'CSTAFF' && !hasAppointmentsWrite);
}
