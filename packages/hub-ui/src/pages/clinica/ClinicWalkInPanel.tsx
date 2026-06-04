import React, { useEffect, useMemo, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { HubCancelButton } from '../../components/HubCancelButton';

type Props = {
  open: boolean;
  clinicId: string;
  onClose: () => void;
  onSubmit: (payload: { petId: string; staffId: string; complaint: string }) => Promise<void>;
  submitting: boolean;
};

const ClinicWalkInPanel: React.FC<Props> = ({ open, clinicId, onClose, onSubmit, submitting }) => {
  const [pets, setPets] = useState<HubPet[]>([]);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [petId, setPetId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [complaint, setComplaint] = useState('');

  useEffect(() => {
    if (!open || !clinicId) return;
    void Promise.all([hubPetsApi.list(clinicId), hubStaffApi.list(clinicId)]).then(([p, s]) => {
      setPets(p.pets ?? []);
      setStaff(s.staff ?? []);
    });
  }, [open, clinicId]);

  const petOptions: HubComboboxOption[] = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );
  const staffOptions: HubComboboxOption[] = useMemo(
    () => staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );

  const handleSubmit = () => {
    if (!petId || !staffId) return;
    void onSubmit({ petId, staffId, complaint }).then(() => {
      setPetId('');
      setStaffId('');
      setComplaint('');
    });
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Atendimento sem agendamento"
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !petId || !staffId}
            onClick={handleSubmit}
          >
            {submitting ? 'A iniciar…' : 'Iniciar atendimento'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes__form-stack">
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="clinic-walkin-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet…"
            allowCreate={false}
          />
        </div>
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Profissional</span>
          <HubSearchableCombobox
            id="clinic-walkin-staff"
            className="hub-combobox--clientes"
            options={staffOptions}
            value={staffId}
            onChange={setStaffId}
            placeholder="Selecionar…"
            allowCreate={false}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="walk_complaint">
            Queixa principal
          </label>
          <textarea
            id="walk_complaint"
            className="hub-clientes__textarea"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </HubSidePanel>
  );
};

export default ClinicWalkInPanel;
