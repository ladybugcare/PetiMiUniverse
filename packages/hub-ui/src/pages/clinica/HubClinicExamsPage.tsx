import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi } from '../../api/hubClinicalApi';

const HubClinicExamsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void hubClinicalApi.listAttachments(clinicId).then((r) => setRows(r.attachments ?? []));
  }, [clinicId, canRead]);

  if (!canRead) return <p style={{ padding: 24 }}>Sem permissão.</p>;

  return (
    <>
      <h1 className="hub-clinic-page__title">Exames e anexos</h1>
      <div className="hub-clinic-table-wrap">
        <table className="hub-clinic-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Ficheiro</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={String(a.id)}>
                <td>{String(a.title || 'Anexo')}</td>
                <td>
                  <a href={String(a.file_url)} target="_blank" rel="noreferrer">
                    Ver
                  </a>
                </td>
                <td>{String(a.created_at || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="hub-clientes__muted">Nenhum exame anexado.</p>}
      </div>
    </>
  );
};

export default HubClinicExamsPage;
