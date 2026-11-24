import React, { useEffect, useMemo, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import '../clientes/clientes.css';

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

  const petOptions = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  if (!canRead) return <p style={{ padding: 24 }}>Sem permissão.</p>;

  return (
    <>
      <h1 className="hub-clinic-page__title">Evoluções</h1>
      <div className="hub-clientes__field" style={{ marginBottom: 16, maxWidth: 360 }}>
        <label className="hub-clientes__label" htmlFor="clinic-evolutions-pet">
          Pet
        </label>
        <HubSearchableCombobox
          id="clinic-evolutions-pet"
          className="hub-combobox--clientes"
          options={petOptions}
          value={petId}
          onChange={setPetId}
          placeholder="Selecionar pet"
          ariaLabel="Selecionar pet"
        />
      </div>
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
