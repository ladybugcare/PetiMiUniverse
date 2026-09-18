import type { AppRole } from '@petimi/web-core';

/** CSTAFF de chão (hotel/creche) — operação no celular (Minha fila), como Banho & Tosa. */
export function isBoardingFloorStaff(
  role: AppRole | string | null | undefined,
  hasAppointmentsWrite: boolean,
): boolean {
  return role === 'CSTAFF' && !hasAppointmentsWrite;
}
