import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi } from '../../api/hubClinicalApi';

const HubClinicVaccinesPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void hubClinicalApi.listVaccinations(clinicId).then((r) => setRows(r.vaccinations ?? []));
  }, [clinicId, canRead]);

  if (!canRead) return <p style={{ padding: 24 }}>Sem permissão.</p>;

  return (
    <>
      <h1 className="hub-clinic-page__title">Vacinas</h1>
      <div className="hub-clinic-table-wrap">
        <table className="hub-clinic-table">
          <thead>
            <tr>
              <th>Vacina</th>
              <th>Lote</th>
              <th>Administrada</th>
              <th>Próxima dose</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={String(v.id)}>
                <td>{String(v.vaccine_name)}</td>
                <td>{String(v.batch_number || '—')}</td>
                <td>{String(v.administered_at || '').slice(0, 10)}</td>
                <td>{String(v.next_dose_at || '—').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hub-clientes__muted">Nenhum registo de vacina.</p>}
      </div>
    </>
  );
};

export default HubClinicVaccinesPage;
