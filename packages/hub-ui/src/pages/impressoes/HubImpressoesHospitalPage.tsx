import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi, type HubHospitalization } from '../../api/hubClinicalApi';
import { HubLoading } from '../../components/HubLoading';
import { HubPrintLayout } from '../../components/print/HubPrintLayout';
import { formatDateLongPt, toYmdLocal } from '../../components/print/printUtils';
import { useAlert } from '../../components/AlertProvider';
import { formatHospDate, HOSP_STATUS_LABEL } from '../clinica/hospital/hospDisplay';
import '../clientes/clientes.css';

const HubImpressoesHospitalPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const [rows, setRows] = useState<HubHospitalization[]>([]);
  const [loading, setLoading] = useState(true);
  const todayYmd = toYmdLocal(new Date());

  const canRead = hasPermission('hub.clinic.read');

  useEffect(() => {
    if (!clinicId || permLoading || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await hubClinicalApi.listHospitalizations(clinicId, 'active');
        if (!cancelled) setRows(res.hospitalizations ?? []);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar internações');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, canRead, permLoading, showError]);

  if (!permLoading && !canRead) {
    return <Navigate to="/hub/impressoes" replace />;
  }

  return (
    <HubPrintLayout
      title="Internações ativas"
      subtitle={`Snapshot · ${formatDateLongPt(todayYmd)}`}
      backTo="/hub/impressoes"
      backLabel="Impressões"
    >
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Carregando internações…" />
      ) : rows.length === 0 ? (
        <p className="hub-print-sheet__empty">Nenhuma internação ativa.</p>
      ) : (
        <div className="hub-print-table-wrap">
          <table className="hub-print-table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Espécie</th>
                <th>Leito</th>
                <th>Tutor</th>
                <th>Entrada</th>
                <th>Status</th>
                <th>Motivo / notas</th>
                <th>Caso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const pet = h.hub_pets?.name || 'Pet';
                const species = h.hub_pets?.species?.trim() || '—';
                const bed = h.hub_hospital_beds?.label || h.hub_hospital_beds?.code || '—';
                const tutor = h.hub_guardians?.full_name || '—';
                const reason =
                  [h.reason?.trim(), h.admission_notes?.trim()].filter(Boolean).join(' — ') || '—';
                const caseTitle = h.hub_clinical_cases?.title?.trim() || '—';
                return (
                  <tr key={h.id}>
                    <td>{pet}</td>
                    <td>{species}</td>
                    <td>{bed}</td>
                    <td>{tutor}</td>
                    <td>{formatHospDate(h.admitted_at)}</td>
                    <td>{HOSP_STATUS_LABEL[h.status] ?? h.status}</td>
                    <td>{reason}</td>
                    <td>{caseTitle}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HubPrintLayout>
  );
};

export default HubImpressoesHospitalPage;
