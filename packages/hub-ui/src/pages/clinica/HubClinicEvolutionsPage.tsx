import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';

const HubClinicEvolutionsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const [pets, setPets] = useState<HubPet[]>([]);
  const [petId, setPetId] = useState('');
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!clinicId) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? []));
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !petId) return;
    void hubClinicalApi.listEvents(clinicId, petId).then((r) => setEvents(r.events ?? []));
  }, [clinicId, petId]);

  if (!canRead) return <p style={{ padding: 24 }}>Sem permissão.</p>;

  return (
    <>
      <h1 className="hub-clinic-page__title">Evoluções</h1>
      <select value={petId} onChange={(e) => setPetId(e.target.value)} style={{ marginBottom: 16, padding: 8 }}>
        <option value="">Selecione o pet</option>
        {pets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="hub-clinic-timeline">
        {events.length === 0 ? (
          <p className="hub-clientes__muted">Sem eventos para este pet.</p>
        ) : (
          events.map((ev) => (
            <div key={String(ev.id)} className="hub-clinic-timeline__item">
              <strong>{String(ev.event_type || 'evento')}</strong>
              <p style={{ margin: '4px 0 0' }}>{String(ev.summary || ev.notes || '')}</p>
              <small>{String(ev.occurred_at || ev.created_at || '')}</small>
            </div>
          ))
        )}
      </div>
    </>
  );
};

export default HubClinicEvolutionsPage;
