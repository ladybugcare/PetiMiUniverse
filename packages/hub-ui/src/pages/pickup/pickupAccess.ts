/**
 * Motorista puro: atualiza paradas, mas não monta rotas.
 * Espelho do isGroomingFloorStaff — redireciona para Minha rota.
 */
export function isPickupDriverOnly(canManageRoutes: boolean, canUpdateStops: boolean): boolean {
  return !canManageRoutes && canUpdateStops;
}
