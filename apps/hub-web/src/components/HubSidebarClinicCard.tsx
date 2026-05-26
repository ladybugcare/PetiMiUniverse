import React, { useCallback, useEffect, useState } from 'react';
import { Store, ExternalLink } from 'lucide-react';
import { apiRequest, getStoredClinicId, CLINIC_STORAGE_UPDATED_EVENT } from '@petimi/web-core';
import { formatCnpjDisplay } from '../utils/formatCnpj';

const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');

type ClinicRow = { name?: string; cnpj?: string | null };

const HubSidebarClinicCard: React.FC = () => {
  const [clinicId, setClinicId] = useState<string | null>(() => getStoredClinicId());
  const [clinic, setClinic] = useState<ClinicRow | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshClinicId = useCallback(() => {
    setClinicId(getStoredClinicId());
  }, []);

  useEffect(() => {
    const onStorage = () => refreshClinicId();
    window.addEventListener('storage', onStorage);
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, onStorage as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, onStorage as EventListener);
    };
  }, [refreshClinicId]);

  useEffect(() => {
    if (!clinicId) {
      setClinic(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = (await apiRequest(`/clinics/${encodeURIComponent(clinicId)}`)) as {
          clinic?: ClinicRow;
        };
        if (!cancelled) setClinic(res?.clinic ?? null);
      } catch {
        if (!cancelled) setClinic(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const openVet = () => {
    if (!vetBase) return;
    window.open(`${vetBase}/clinic-dashboard`, '_blank', 'noopener,noreferrer');
  };

  const name = !clinicId
    ? 'Sem clínica'
    : loading && !clinic
      ? 'Carregando…'
      : clinic?.name?.trim() || 'Clínica';
  const cnpjLine = !clinicId ? '—' : loading && !clinic ? '…' : formatCnpjDisplay(clinic?.cnpj ?? undefined);

  return (
    <div className="hub-sidebar__clinic-card">
      <div className="hub-sidebar__clinic-card__accent" aria-hidden />
      <div className="hub-sidebar__clinic-card__main">
        <div className="hub-sidebar__clinic-card__icon-wrap" aria-hidden>
          <Store size={22} strokeWidth={1.75} />
        </div>
        <div className="hub-sidebar__clinic-card__text">
          <div className="hub-sidebar__clinic-card__name">{name}</div>
          <div className="hub-sidebar__clinic-card__cnpj">{cnpjLine}</div>
        </div>
        <button
          type="button"
          className="hub-sidebar__clinic-card__swap"
          onClick={openVet}
          disabled={!vetBase}
          title={
            vetBase
              ? 'Abrir PetMi Vet noutro separador'
              : 'Defina VITE_VET_WEB_URL para abrir o PetMi Vet'
          }
          aria-label="Abrir PetMi Vet noutro separador"
        >
          <ExternalLink size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};

export default HubSidebarClinicCard;
