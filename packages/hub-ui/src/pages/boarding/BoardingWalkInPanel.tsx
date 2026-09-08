import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { todayYmd } from '../../utils/hubCalendar';
import { nowHm } from '../../utils/hubTime';
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

function combineDateTime(dateIso: string, timeHm: string): string | undefined {
  if (!dateIso.trim()) return undefined;
  const hm = timeHm.trim() || '00:00';
  return `${dateIso}T${hm}`;
}

const BoardingWalkInPanel: React.FC<Props> = ({ open, clinicId, unitId: _unitId, onClose, onSubmit, submitting }) => {
  const [pets, setPets] = useState<HubPet[]>([]);
  const [petId, setPetId] = useState('');
  const [mode, setMode] = useState<BoardingMode>('hotel');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !clinicId) return;
    void hubPetsApi.list(clinicId).then((p) => setPets(p.pets ?? []));
  }, [open, clinicId]);

  useEffect(() => {
    if (!open) return;
    if (!checkInDate) {
      setCheckInDate(todayYmd());
      setCheckInTime(nowHm());
    }
  }, [open, checkInDate]);

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
      expectedCheckIn: combineDateTime(checkInDate, checkInTime),
      expectedCheckOut: combineDateTime(checkOutDate, checkOutTime),
      notes: notes.trim() || undefined,
    }).then(() => {
      setPetId('');
      setMode('hotel');
      setCheckInDate('');
      setCheckInTime('');
      setCheckOutDate('');
      setCheckOutTime('');
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
        <p className="nam-muted" style={{ marginBottom: 8 }}>
          <Link to="/hub/appointments?openWalkIn=1" className="hub-btn hub-btn--link" onClick={onClose}>
            <Calendar size={14} aria-hidden /> Registrar pela Agenda (recepção)
          </Link>
        </p>
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
          <span className="hub-clientes__label">Check-in previsto</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <HubDateField
              id="boarding-walkin-checkin-date"
              label="Data"
              valueIso={checkInDate}
              onChangeIso={setCheckInDate}
              showTodayButton={false}
            />
            <HubTimeField
              id="boarding-walkin-checkin-time"
              label="Horário"
              valueHm={checkInTime}
              onChangeHm={setCheckInTime}
            />
          </div>
        </div>

        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Check-out previsto</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <HubDateField
              id="boarding-walkin-checkout-date"
              label="Data"
              valueIso={checkOutDate}
              onChangeIso={setCheckOutDate}
              showTodayButton={false}
            />
            <HubTimeField
              id="boarding-walkin-checkout-time"
              label="Horário"
              valueHm={checkOutTime}
              onChangeHm={setCheckOutTime}
            />
          </div>
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
