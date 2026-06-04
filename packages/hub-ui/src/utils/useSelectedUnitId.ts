import { useEffect, useState } from 'react';

const SELECTED_UNIT_KEY = 'selected_unit_id';
const HUB_UNIT_STORAGE_UPDATED_EVENT = 'petimi:hub-unit-storage-updated';

export function getSelectedUnitId(): string | null {
  try {
    const id = localStorage.getItem(SELECTED_UNIT_KEY);
    return id && id.trim() ? id : null;
  } catch {
    return null;
  }
}

/**
 * Lê o id da unidade selecionada e re-renderiza quando o cabeçalho a
 * (re)define, inclusive na seleção automática da unidade padrão. Isso evita
 * a mensagem "Selecione uma unidade no cabeçalho." quando a página é carregada
 * antes do contexto persistir a unidade no localStorage.
 */
export function useSelectedUnitId(): string | null {
  const [unitId, setUnitId] = useState<string | null>(() => getSelectedUnitId());

  useEffect(() => {
    const sync = () => setUnitId(getSelectedUnitId());
    window.addEventListener(HUB_UNIT_STORAGE_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener(HUB_UNIT_STORAGE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return unitId;
}
