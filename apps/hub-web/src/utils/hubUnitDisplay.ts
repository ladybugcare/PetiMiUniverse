import { unitShortLabel as sharedUnitShortLabel, type UnitDisplaySource } from '@petimi/hub-ui';
import type { HubUnit } from '../types/hubUnit';

/**
 * Rótulo curto e estável para o seletor de unidade (header).
 * Preferência: nickname distinto → sobra após o nome da clínica → "Matriz" se is_main → name.
 */
export function unitShortLabel(unit: HubUnit, clinicName?: string): string {
  return sharedUnitShortLabel(unit as UnitDisplaySource, clinicName);
}
