import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi } from '../../api/hubClinicalApi';

const HubClinicPrescriptionsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void hubClinicalApi.listPrescriptions(clinicId).then((r) => setRows(r.prescriptions ?? []));
  }, [clinicId, canRead]);

  if (!canRead) return <p style={{ padding: 24 }}>Sem permissão.</p>;

  return (
    <>
      <h1 className="hub-clinic-page__title">Prescrições</h1>
      <div className="hub-clinic-table-wrap">
        <table className="hub-clinic-table">
          <thead>
            <tr>
              <th>Medicamento</th>
              <th>Posologia</th>
              <th>Pet</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={String(p.id)}>
                <td>{String(p.medication_name || '—')}</td>
                <td>{String(p.posology || '—')}</td>
                <td>{String(p.pet_id || '').slice(0, 8)}…</td>
                <td>{String(p.created_at || '').slice(0, 10)}</td>
                <td>
                  {clinicId ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost"
                      onClick={() => hubClinicalApi.openPrescriptionPdf(String(p.id), clinicId)}
                    >
                      Imprimir receita
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hub-clientes__muted">Nenhuma prescrição.</p>}
      </div>
    </>
  );
};

export default HubClinicPrescriptionsPage;
