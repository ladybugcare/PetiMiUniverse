import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { useAlert } from '../../components/AlertProvider';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import {
  hubBoardingApi,
  type BoardingCareProfile,
  type BoardingDaycarePeriod,
  type BoardingSpace,
  type BoardingUnitSettings,
} from '../../api/hubBoardingApi';
import { todayYmd } from '../../utils/hubCalendar';
import { nowHm } from '../../utils/hubTime';
import { CARE_BLOCK_LABELS, PROFILE_BLOCK_KEYS, isCapacityWarningError, parseBRLToCents, summarizeBlock } from './boardingCareUi';

type Props = {
  open: boolean;
  clinicId: string;
  unitId?: string | null;
  settings?: BoardingUnitSettings | null;
  onClose: () => void;
  /** Reserva criada: o painel abre a estadia na aba Cuidados. */
  onCreated: (reservationId: string, status: 'reserved' | 'checked_in') => void;
};

function toIso(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || '12:00'}:00`).toISOString();
}

const BoardingNewStayPanel: React.FC<Props> = ({ open, clinicId, unitId, settings, onClose, onCreated }) => {
  const { showError } = useAlert();
  const [pets, setPets] = useState<HubPet[]>([]);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [spaces, setSpaces] = useState<BoardingSpace[]>([]);
  const [petId, setPetId] = useState('');
  const [mode, setMode] = useState<'hotel' | 'daycare'>('hotel');
  const [when, setWhen] = useState<'now' | 'future'>('now');
  const [inDate, setInDate] = useState('');
  const [inTime, setInTime] = useState('');
  const [outDate, setOutDate] = useState('');
  const [outTime, setOutTime] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [period, setPeriod] = useState<BoardingDaycarePeriod>('full_day');
  const [shiftKey, setShiftKey] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');
  const [profile, setProfile] = useState<BoardingCareProfile | null>(null);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPetId('');
    setMode('hotel');
    setWhen('now');
    setInDate(todayYmd());
    setInTime(nowHm());
    setOutDate('');
    setOutTime('');
    setServiceId('');
    setPeriod('full_day');
    setShiftKey('');
    setSpaceId('');
    setRate('');
    setNotes('');
    setProfile(null);
    setCapacityMessage(null);
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
    void hubServiceTypesApi
      .list(clinicId)
      .then((r) => setServiceTypes((r.service_types ?? []).filter((s) => s.active)))
      .catch(() => setServiceTypes([]));
    void hubBoardingApi
      .spaces(clinicId, { unitId: unitId ?? undefined })
      .then((r) => setSpaces((r.spaces ?? []).filter((s) => s.active)))
      .catch(() => setSpaces([]));
  }, [open, clinicId, unitId]);

  useEffect(() => {
    if (!petId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void hubBoardingApi
      .getCareProfile(petId, clinicId)
      .then((r) => {
        if (!cancelled) setProfile(r.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [petId, clinicId]);

  const petOptions: HubComboboxOption[] = useMemo(
    () =>
      pets.map((p) => ({
        value: p.id,
        label: p.name,
        searchText: p.primary_guardian?.guardian_name ?? undefined,
      })),
    [pets],
  );
  const group = mode === 'hotel' ? 'hotel' : 'creche';
  const serviceOptions: HubComboboxOption[] = useMemo(
    () => serviceTypes.filter((s) => s.service_group === group).map((s) => ({ value: s.id, label: s.name })),
    [serviceTypes, group],
  );
  const spaceOptions = spaces.filter((s) => s.mode === 'shared' || s.mode === mode);
  const shifts = settings?.daycare_shifts ?? [];
  const selectedPet = pets.find((p) => p.id === petId);
  const missing = PROFILE_BLOCK_KEYS.filter((k) => !profile || !summarizeBlock(k, profile));
  const valid = Boolean(petId) && (when === 'now' || Boolean(inDate));

  const submit = async (force: boolean) => {
    if (!valid) return;
    setBusy(true);
    try {
      const status = when === 'now' ? 'checked_in' : 'reserved';
      const rateCents = parseBRLToCents(rate);
      const { reservation } = await hubBoardingApi.createReservation({
        clinic_id: clinicId,
        pet_id: petId,
        guardian_id: selectedPet?.primary_guardian?.guardian_id ?? null,
        unit_id: unitId ?? null,
        mode,
        status,
        expected_check_in: when === 'now' ? new Date().toISOString() : toIso(inDate, inTime),
        expected_check_out: toIso(outDate, outTime),
        hub_service_type_id: serviceId || null,
        ...(mode === 'daycare' ? { daycare_period: period, daycare_shift_key: shiftKey || null } : {}),
        space_id: spaceId || null,
        ...(rateCents != null ? { daily_rate_cents: rateCents } : {}),
        notes: notes.trim() || null,
        ...(force ? { force_capacity: true } : {}),
      });
      onCreated(reservation.id, status);
    } catch (e: unknown) {
      if (isCapacityWarningError(e)) setCapacityMessage((e as Error).message);
      else showError((e as Error)?.message || 'Erro ao registrar a hospedagem');
    } finally {
      setBusy(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Nova hospedagem"
      subtitle="Entrada agora ou reserva para outro dia."
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={busy || !valid}
            onClick={() => void submit(Boolean(capacityMessage))}
          >
            {busy
              ? 'Registrando…'
              : capacityMessage
                ? 'Confirmar acima da capacidade'
                : when === 'now'
                  ? 'Fazer check-in'
                  : 'Criar reserva'}
          </button>
        </div>
      }
    >
      <div className="hub-grooming-drawer">
        {capacityMessage ? (
          <div className="hub-clinic-banner hub-clinic-banner--warning" role="alert">
            <p>{capacityMessage}</p>
          </div>
        ) : null}

        <div className="hub-clientes__field">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="boarding-new-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet ou tutor…"
            allowCreate={false}
          />
          {selectedPet?.primary_guardian?.guardian_name ? (
            <p className="hub-grooming-drawer__hint">Tutor: {selectedPet.primary_guardian.guardian_name}</p>
          ) : null}
        </div>

        <div className="hub-boarding-care__grid">
          <div className="hub-clientes__field">
            <span className="hub-clientes__label">Modalidade</span>
            <div className="hub-clientes__btn-row">
              {(['hotel', 'daycare'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  className={`hub-clientes__btn hub-clientes__btn--sm ${mode === m ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                  onClick={() => {
                    setMode(m);
                    setServiceId('');
                    setSpaceId('');
                    setCapacityMessage(null);
                  }}
                >
                  {m === 'hotel' ? 'Hotel' : 'Creche'}
                </button>
              ))}
            </div>
          </div>
          <div className="hub-clientes__field">
            <span className="hub-clientes__label">Quando</span>
            <div className="hub-clientes__btn-row">
              {(['now', 'future'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={when === w}
                  className={`hub-clientes__btn hub-clientes__btn--sm ${when === w ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                  onClick={() => {
                    setWhen(w);
                    setCapacityMessage(null);
                  }}
                >
                  {w === 'now' ? 'Entrada agora' : 'Reserva futura'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hub-boarding-care__grid">
          {when === 'future' ? (
            <>
              <HubDateField id="boarding-new-in-date" label="Entrada" valueIso={inDate} onChangeIso={setInDate} showTodayButton={false} />
              <HubTimeField id="boarding-new-in-time" label="Horário" valueHm={inTime} onChangeHm={setInTime} minuteStep={5} />
            </>
          ) : null}
          <HubDateField
            id="boarding-new-out-date"
            label={mode === 'hotel' ? 'Saída prevista' : 'Busca prevista'}
            valueIso={outDate}
            onChangeIso={setOutDate}
            showTodayButton={mode === 'daycare'}
          />
          <HubTimeField id="boarding-new-out-time" label="Horário" valueHm={outTime} onChangeHm={setOutTime} minuteStep={5} />
        </div>

        <div className="hub-boarding-care__grid">
          <div className="hub-clientes__field">
            <span className="hub-clientes__label">Serviço</span>
            <HubSearchableCombobox
              id="boarding-new-service"
              className="hub-combobox--clientes"
              options={serviceOptions}
              value={serviceId}
              onChange={setServiceId}
              placeholder={serviceOptions.length ? 'Usar o padrão da tabela' : 'Nenhum serviço cadastrado'}
              allowCreate={false}
            />
          </div>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="boarding-new-rate">
              {mode === 'hotel' ? 'Valor da diária (R$)' : 'Valor do dia (R$)'}
            </label>
            <input
              id="boarding-new-rate"
              className="hub-clientes__input"
              inputMode="decimal"
              value={rate}
              placeholder="Em branco usa a tabela"
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          {mode === 'daycare' ? (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="boarding-new-period">
                Período
              </label>
              <HubSearchableCombobox
                id="boarding-new-period"
                options={[
                  { value: 'full_day', label: 'Período integral' },
                  { value: 'half_day', label: 'Meio período' },
                ]}
                value={period}
                placeholder="Período"
                clearable={false}
                onChange={(val) => setPeriod((val || 'full_day') as BoardingDaycarePeriod)}
              />
            </div>
          ) : null}
          {mode === 'daycare' && shifts.length ? (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="boarding-new-shift">
                Turno
              </label>
              <HubSearchableCombobox
                id="boarding-new-shift"
                options={shifts.map((s) => ({
                  value: s.key,
                  label: `${s.label} (${s.start}–${s.end})`,
                }))}
                value={shiftKey}
                placeholder="Sem turno"
                searchPlaceholder="Buscar turno…"
                clearable
                onChange={setShiftKey}
              />
            </div>
          ) : null}
          {spaceOptions.length ? (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="boarding-new-space">
                Acomodação
              </label>
              <HubSearchableCombobox
                id="boarding-new-space"
                options={spaceOptions.map((s) => ({
                  value: s.id,
                  label: `${s.name} · ${s.current ?? 0}/${s.capacity}`,
                }))}
                value={spaceId}
                placeholder="Definir depois"
                searchPlaceholder="Buscar acomodação…"
                clearable
                onChange={(val) => {
                  setSpaceId(val);
                  setCapacityMessage(null);
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="boarding-new-notes">
            Observações da reserva
          </label>
          <textarea
            id="boarding-new-notes"
            className="hub-clientes__input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {petId ? (
          <section className="hub-grooming-drawer__section">
            <h4 className="hub-grooming-drawer__heading">Ficha de cuidados do pet</h4>
            <ul className="hub-grooming-drawer__service-list">
              {PROFILE_BLOCK_KEYS.map((k) => {
                const text = profile ? summarizeBlock(k, profile) : null;
                return (
                  <li key={k}>
                    <strong>{CARE_BLOCK_LABELS[k]}:</strong>{' '}
                    {text ?? <span className="hub-grooming-drawer__muted">Não informado</span>}
                  </li>
                );
              })}
            </ul>
            <p className="hub-grooming-drawer__hint hub-boarding-stay__spaced">
              {missing.length
                ? 'O plano da estadia herda a ficha. Depois de criar, confirme o que vale para esta vez e preencha o que falta.'
                : 'O plano da estadia herda a ficha. Depois de criar, só confirme o que vale para esta vez.'}
            </p>
          </section>
        ) : null}

        <p className="hub-grooming-drawer__hint">
          <Link to="/hub/appointments?openWalkIn=1" className="hub-clientes__link-btn hub-clientes__link-btn--with-icon" onClick={onClose}>
            <Calendar size={14} aria-hidden /> Registrar pela Agenda
          </Link>
        </p>
      </div>
    </HubSidePanel>
  );
};

export default BoardingNewStayPanel;
