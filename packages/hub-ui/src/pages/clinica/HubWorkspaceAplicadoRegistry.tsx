import React, { useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  type HubEncounter,
  type HubMedicationAdministration,
  type HubVaccination,
} from '../../api/hubClinicalApi';
import { HubCwsGroupedRegistry, type HubCwsRegistryRow } from './HubCwsGroupedRegistry';

function formatMoneyBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function HubWorkspaceAplicadoRegistry({
  encounter,
  clinicId,
  refreshKey = 0,
}: {
  encounter: HubEncounter;
  clinicId: string;
  refreshKey?: number;
}) {
  const [meds, setMeds] = useState<HubMedicationAdministration[]>([]);
  const [vax, setVax] = useState<HubVaccination[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      hubClinicalApi.listMedicationAdministrations(clinicId, {
        petId: encounter.pet_id ?? undefined,
        encounterId: encounter.id,
      }),
      hubClinicalApi.listVaccinations(clinicId, encounter.pet_id ?? undefined),
    ])
      .then(([medRes, vaxRes]) => {
        if (cancelled) return;
        setMeds(medRes.administrations ?? []);
        setVax(vaxRes.vaccinations ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMeds([]);
        setVax([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, encounter.id, encounter.pet_id, refreshKey]);

  const rows = useMemo(() => {
    const out: HubCwsRegistryRow[] = [];

    for (const it of meds) {
      const meta = [
        it.medication_name || null,
        [it.dose, it.use_route].filter(Boolean).join(' · ') || null,
        it.batch_number ? `lote ${it.batch_number}` : null,
        it.hub_inventory_item_id && it.quantity != null && it.quantity !== 1
          ? `qtd. ${it.quantity}`
          : null,
        formatMoneyBrl(it.service_price) || null,
      ]
        .filter(Boolean)
        .join(' · ');
      out.push({
        id: `med-${it.id}`,
        category: 'Medicação',
        title: it.service_name || it.medication_name || 'Medicação na consulta',
        meta: meta || undefined,
        when: formatWhen(it.administered_at),
      });
    }

    const vacRows = vax.filter((v) => v.source !== 'external' && v.hub_encounter_id === encounter.id);
    for (const v of vacRows) {
      const meta = [
        v.batch_number ? `lote ${v.batch_number}` : null,
        formatMoneyBrl(v.price) || null,
        v.next_dose_at ? `próxima ${v.next_dose_at.slice(0, 10)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      out.push({
        id: `vax-${v.id}`,
        category: 'Vacina',
        title: v.vaccine_name,
        meta: meta || undefined,
        when: v.administered_at ? v.administered_at.slice(0, 10) : undefined,
      });
    }

    return out;
  }, [meds, vax, encounter.id, encounter.hub_case_id]);

  return (
    <HubCwsGroupedRegistry
      title="Registrado neste atendimento"
      emptyLabel="Nada aplicado neste atendimento ainda."
      rows={rows}
    />
  );
}
