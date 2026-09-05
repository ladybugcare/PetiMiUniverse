/** Origens de linha de produto cujo estoque já saiu via encounter_out (não repetir sale_out no checkout). */
export function comandaProductOriginAlreadyStockedOut(originType: string | null | undefined): boolean {
  const t = String(originType ?? '');
  return t === 'vaccination' || t === 'medication_product';
}
