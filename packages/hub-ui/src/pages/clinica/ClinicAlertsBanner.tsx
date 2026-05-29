import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { hubClinicalApi, type HubClinicalAlert } from '../../api/hubClinicalApi';

type Props = {
  clinicId: string;
};

const ClinicAlertsBanner: React.FC<Props> = ({ clinicId }) => {
  const [alerts, setAlerts] = useState<HubClinicalAlert[]>([]);

  useEffect(() => {
    if (!clinicId) return;
    void hubClinicalApi.alerts(clinicId).then((r) => setAlerts(r.alerts ?? [])).catch(() => setAlerts([]));
  }, [clinicId]);

  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, 3);

  return (
    <div className="hub-clinic-alerts" role="status">
      <AlertTriangle size={18} aria-hidden />
      <div className="hub-clinic-alerts__body">
        <strong>Alertas clínicos</strong>
        <ul className="hub-clinic-alerts__list">
          {preview.map((a, i) => (
            <li key={`${a.pet_id}-${i}`}>
              {a.pet && typeof a.pet === 'object' && 'name' in a.pet ? `${(a.pet as { name?: string }).name}: ` : ''}
              {a.message}
              {a.pet_id ? (
                <>
                  {' '}
                  <Link to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(a.pet_id)}`}>Ver pet</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {alerts.length > 3 ? (
          <p className="hub-clientes__muted">+{alerts.length - 3} alerta(s)</p>
        ) : null}
      </div>
    </div>
  );
};

export default ClinicAlertsBanner;
