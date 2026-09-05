import React, { useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  hubClinicalExamsApi,
  hubSpecialistReferralsApi,
  type HubClinicalExam,
  type HubEncounter,
  type HubPrescription,
  type HubSpecialistReferral,
} from '../../api/hubClinicalApi';
import { formatHubClinicalExamStatus, formatPrescriptionItemMeta } from './clinicalDisplay';
import { HubCwsGroupedRegistry, type HubCwsRegistryRow } from './HubCwsGroupedRegistry';

const PRIORITY_LABELS = { routine: 'Rotina', urgent: 'Urgente' } as const;

export function HubWorkspaceSolicitacoesRegistry({
  encounter,
  clinicId,
  refreshKey = 0,
}: {
  encounter: HubEncounter;
  clinicId: string;
  refreshKey?: number;
}) {
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [referrals, setReferrals] = useState<HubSpecialistReferral[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      hubClinicalApi.listPrescriptions(
        clinicId,
        encounter.pet_id ?? undefined,
        encounter.hub_case_id ?? undefined,
        encounter.id,
      ),
      hubClinicalExamsApi.list(clinicId, { encounterId: encounter.id }),
      hubSpecialistReferralsApi.list(clinicId, { encounterId: encounter.id }),
    ])
      .then(([rxRes, examRes, refRes]) => {
        if (cancelled) return;
        setPrescriptions(rxRes.prescriptions ?? []);
        setExams(examRes.exams ?? []);
        setReferrals(refRes.referrals ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setPrescriptions([]);
        setExams([]);
        setReferrals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, encounter.id, encounter.pet_id, encounter.hub_case_id, refreshKey]);

  const rows = useMemo(() => {
    const out: HubCwsRegistryRow[] = [];

    const sameEncounter = prescriptions.filter((p) => p.hub_encounter_id === encounter.id);
    for (const rx of sameEncounter) {
      const items = rx.items ?? [];
      if (items.length === 0) {
        out.push({
          id: `rx-${rx.id}`,
          category: 'Receita',
          title: 'Receita (sem itens)',
          meta: rx.status === 'issued' ? 'Emitida' : undefined,
        });
        continue;
      }
      for (const it of items) {
        out.push({
          id: `rx-${rx.id}-${it.id ?? it.medication_name}`,
          category: 'Receita',
          title: it.medication_name,
          meta: [formatPrescriptionItemMeta(it), rx.status === 'issued' ? 'Emitida' : null]
            .filter(Boolean)
            .join(' · '),
        });
      }
    }

    for (const ex of exams) {
      if (ex.status === 'cancelled') continue;
      const lab =
        ex.lab_kind === 'external'
          ? ex.external_lab_name || 'Lab. externo'
          : ex.lab_name || 'Lab. interno';
      out.push({
        id: `ex-${ex.id}`,
        category: 'Exame',
        title: ex.exam_type,
        meta: [lab, formatHubClinicalExamStatus(ex.status), ex.document_status === 'issued' ? 'Documento emitido' : null]
          .filter(Boolean)
          .join(' · '),
      });
    }

    for (const ref of referrals) {
      if (ref.status === 'cancelled') continue;
      out.push({
        id: `ref-${ref.id}`,
        category: 'Encaminhamento',
        title: ref.specialty,
        meta: [
          ref.specialist_name || null,
          PRIORITY_LABELS[ref.priority] ?? null,
          ref.status === 'issued' ? 'Emitido' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    return out;
  }, [prescriptions, exams, referrals, encounter.id]);

  return (
    <HubCwsGroupedRegistry
      title="Solicitado neste atendimento"
      emptyLabel="Nenhuma solicitação neste atendimento ainda."
      rows={rows}
    />
  );
}
