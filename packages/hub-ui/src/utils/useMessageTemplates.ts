import { useEffect, useState } from 'react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubClinicSettingsApi } from '../api/hubClinicSettingsApi';

/**
 * Carrega os templates de mensagem customizados da clínica atual.
 * Retorna um objeto `overrides` pronto para passar a `renderTemplate`.
 * Silencia erros de rede — se falhar, os templates padrão serão usados.
 */
export function useMessageTemplates(): Record<string, string> {
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const clinicId = getStoredClinicId();
    if (!clinicId) return;
    hubClinicSettingsApi
      .get(clinicId)
      .then((res) => {
        setOverrides(res.settings.message_templates ?? {});
      })
      .catch(() => {
        // Silencioso: usa templates padrão se falhar
      });
  }, []);

  return overrides;
}
