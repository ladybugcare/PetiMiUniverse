/** Dispara a reconciliação da recepção sem acoplar o controller ao serviço. */
export function scheduleReceptionSync(clinicId: string, petId: string | null | undefined): void {
  if (!clinicId || !petId) return;
  void import('./receptionHandoffService')
    .then((m) => m.syncReceptionHandoffsForPet(clinicId, petId))
    .catch((e) => console.error('syncReceptionHandoffs', e));
}
