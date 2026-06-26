import React, { useEffect, useMemo, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import type { BoardingMode } from './boardingStages';

type Props = {
  open: boolean;
  clinicId: string;
  unitId?: string;
  onClose: () => void;
  onSubmit: (payload: {
    petId: string;
    guardianId?: string;
    mode: BoardingMode;
    expectedCheckIn?: string;
    expectedCheckOut?: string;
    notes?: string;
  }) => Promise<void>;
  submitting: boolean;
};

const BoardingWalkInPanel: React.FC<Props> = ({ open, clinicId, unitId: _unitId, onClose, onSubmit, submitting }) => {
  const [pets, setPets] = useState<HubPet[]>([]);
  const [petId, setPetId] = useState('');
  const [mode, setMode] = useState<BoardingMode>('hotel');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !clinicId) return;
    void hubPetsApi.list(clinicId).then((p) => setPets(p.pets ?? []));
  }, [open, clinicId]);

  const petOptions: HubComboboxOption[] = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  const selectedPet = pets.find((p) => p.id === petId);
  const guardianId = selectedPet?.primary_guardian?.guardian_id ?? undefined;

  const valid = !!petId;

  const handleSubmit = () => {
    if (!valid) return;
    void onSubmit({
      petId,
      guardianId,
      mode,
      expectedCheckIn: checkIn || undefined,
      expectedCheckOut: checkOut || undefined,
      notes: notes.trim() || undefined,
    }).then(() => {
      setPetId('');
      setMode('hotel');
      setCheckIn('');
      setCheckOut('');
      setNotes('');
    });
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Entrada avulsa"
      subtitle="Registra um check-in sem agendamento prévio."
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !valid}
            onClick={handleSubmit}
          >
            {submitting ? 'Registrando…' : 'Confirmar entrada'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes__form-stack">
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="boarding-walkin-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet…"
          />
        </div>

        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Modalidade</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['hotel', 'daycare'] as BoardingMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`hub-clientes__btn hub-clientes__btn--sm${mode === m ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
                onClick={() => setMode(m)}
              >
                {m === 'hotel' ? 'Hotel' : 'Creche'}
              </button>
            ))}
          </div>
        </div>

        <div className="hub-servicos__filter-field">
          <label className="hub-clientes__label" htmlFor="boarding-walkin-checkin">
            Check-in previsto
          </label>
          <input
            id="boarding-walkin-checkin"
            type="datetime-local"
            className="hub-clientes__input"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>

        <div className="hub-servicos__filter-field">
          <label className="hub-clientes__label" htmlFor="boarding-walkin-checkout">
            Check-out previsto
          </label>
          <input
            id="boarding-walkin-checkout"
            type="datetime-local"
            className="hub-clientes__input"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>

        <div className="hub-servicos__filter-field">
          <label className="hub-clientes__label" htmlFor="boarding-walkin-notes">
            Observações
          </label>
          <textarea
            id="boarding-walkin-notes"
            className="hub-clientes__input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alergias, medicamentos, preferências…"
          />
        </div>
      </div>
    </HubSidePanel>
  );
};

export default BoardingWalkInPanel;
