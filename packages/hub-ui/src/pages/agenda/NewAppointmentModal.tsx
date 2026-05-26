import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, GripVertical, AlertCircle, CalendarDays, RefreshCw } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { HubModal } from '../../components/HubModal';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubBrDateInput } from '../../components/HubBrDateInput';
import {
  hubAgendaApi,
  type CreateHubAppointmentPayload,
  type HubAppointmentStatus,
  type HubAppointmentRecurrenceRule,
} from '../../api/hubAgendaApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import type { HubStaffMember } from '../../api/hubStaffApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { STATUS_META, type AgendaStatus } from './agendaModel';
import './new-appointment-modal.css';

export type NewAppointmentInitial = {
  date?: string;
  starts_at?: string;
  ends_at?: string;
  hub_staff_member_id?: string | null;
  resource_label?: string | null;
};

export type NewAppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: NewAppointmentInitial | null;
  staffOptions: HubStaffMember[];
  serviceTypes: HubServiceType[];
};

type ServiceChip = {
  hub_service_type_id: string;
  name: string;
  duration_minutes: number;
};

type ExtraBlock = {
  key: string;
  services: ServiceChip[];
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

type PickupSubBlock = {
  starts_hm: string;
  ends_hm: string;
  hub_staff_member_id: string;
  resource_label: string;
};

type RecurrenceForm = {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value: number;
  days_of_week: number[];
  end_kind: 'until' | 'occurrences';
  until_date: string;
  occurrences: number;
};

const DEFAULT_RECURRENCE: RecurrenceForm = {
  kind: 'weekly',
  interval_value: 1,
  days_of_week: [],
  end_kind: 'occurrences',
  until_date: '',
  occurrences: 4,
};

const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function toIsoTs(dateYmd: string, hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function addMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function tsToHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  open,
  onClose,
  onSaved,
  initial,
  staffOptions,
  serviceTypes,
}) => {
  const clinicId = getStoredClinicId() ?? '';

  // ── Core fields ────────────────────────────────────────────────────────────
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [startsHm, setStartsHm] = useState('09:00');
  const [endsHm, setEndsHm] = useState('10:00');
  const [staffId, setStaffId] = useState('');
  const [resourceLabel, setResourceLabel] = useState('');
  const [status, setStatus] = useState<AgendaStatus>('confirmed');

  // ── Services ───────────────────────────────────────────────────────────────
  const [groupFilter, setGroupFilter] = useState('all');
  const [services, setServices] = useState<ServiceChip[]>([]);
  const [serviceSearchId, setServiceSearchId] = useState('');

  // ── Pet / Guardian ────────────────────────────────────────────────────────
  const [guardianId, setGuardianId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [petId, setPetId] = useState('');
  const [petName, setPetName] = useState('');
  const [guardianPets, setGuardianPets] = useState<Array<{ id: string; name: string }>>([]);
  const [guardianOptions, setGuardianOptions] = useState<HubComboboxOption[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);

  // ── Title / Description ───────────────────────────────────────────────────
  const [titleOverridden, setTitleOverridden] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // ── Recurrence ────────────────────────────────────────────────────────────
  const [withRecurrence, setWithRecurrence] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceForm>({ ...DEFAULT_RECURRENCE });

  // ── L&T ───────────────────────────────────────────────────────────────────
  const [withPickup, setWithPickup] = useState(false);
  const [pickupBefore, setPickupBefore] = useState<PickupSubBlock>({ starts_hm: '08:00', ends_hm: '09:00', hub_staff_member_id: '', resource_label: '' });
  const [pickupAfter, setPickupAfter] = useState<PickupSubBlock>({ starts_hm: '11:00', ends_hm: '12:00', hub_staff_member_id: '', resource_label: '' });

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const [extraBlocks, setExtraBlocks] = useState<ExtraBlock[]>([]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Array<{ date: string; reason: string }>>([]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalDurationMin = useMemo(() => services.reduce((s, c) => s + c.duration_minutes, 0), [services]);

  const autoTitle = useMemo(() => {
    const svcPart = services.map((s) => s.name).join(' + ') || '';
    const petPart = petName || '';
    if (!svcPart && !petPart) return '';
    if (!petPart) return svcPart;
    if (!svcPart) return petPart;
    return `${svcPart} — ${petPart}`;
  }, [services, petName]);

  useEffect(() => {
    if (!titleOverridden) setTitle(autoTitle);
  }, [autoTitle, titleOverridden]);

  // When services change, recalc ends_hm
  useEffect(() => {
    if (totalDurationMin > 0) {
      setEndsHm(addMinutes(startsHm, totalDurationMin));
    }
  }, [totalDurationMin, startsHm]);

  // Apply initial values when modal opens
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setConflicts([]);
    setTitleOverridden(false);
    if (initial) {
      if (initial.date) setDateYmd(initial.date);
      if (initial.starts_at) setStartsHm(tsToHm(initial.starts_at));
      if (initial.ends_at) setEndsHm(tsToHm(initial.ends_at));
      if (initial.hub_staff_member_id) setStaffId(initial.hub_staff_member_id);
      if (initial.resource_label) setResourceLabel(initial.resource_label);
    }
  }, [open, initial]);

  // Load guardians
  useEffect(() => {
    if (!open || !clinicId) return;
    setGuardiansLoading(true);
    hubGuardiansApi
      .list(clinicId, false, { status: 'active' })
      .then(({ guardians }) => {
        setGuardianOptions(guardians.map((g) => ({ value: g.id, label: g.full_name })));
      })
      .catch(() => setGuardianOptions([]))
      .finally(() => setGuardiansLoading(false));
  }, [open, clinicId]);

  // Load pets when guardian changes
  useEffect(() => {
    if (!guardianId || !clinicId) {
      setGuardianPets([]);
      setPetId('');
      setPetName('');
      return;
    }
    hubGuardiansApi.getById(guardianId, clinicId).then(({ pets }) => {
      setGuardianPets(pets.map((p) => ({ id: p.id, name: p.name })));
      if (pets.length === 1) {
        setPetId(pets[0]!.id);
        setPetName(pets[0]!.name);
      } else {
        setPetId('');
        setPetName('');
      }
    }).catch(() => setGuardianPets([]));
  }, [guardianId, clinicId]);

  // ── Service groups for filter ─────────────────────────────────────────────
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const opts: HubComboboxOption[] = [{ value: 'all', label: 'Todos os grupos' }];
    for (const st of serviceTypes) {
      if (!seen.has(st.service_group)) {
        seen.add(st.service_group);
        opts.push({ value: st.service_group, label: st.service_group });
      }
    }
    return opts;
  }, [serviceTypes]);

  const filteredServiceTypes = useMemo(
    () => serviceTypes.filter((st) => st.allow_scheduling !== false && (groupFilter === 'all' || st.service_group === groupFilter)),
    [serviceTypes, groupFilter],
  );

  const serviceComboOptions = useMemo<HubComboboxOption[]>(
    () => filteredServiceTypes.map((st) => ({ value: st.id, label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}` })),
    [filteredServiceTypes],
  );

  const staffComboOptions = useMemo<HubComboboxOption[]>(
    () => [
      { value: '', label: 'Não atribuído' },
      ...staffOptions
        .filter((s) => s.active && s.accepts_appointments)
        .map((s) => ({ value: s.id, label: s.display_name ?? s.full_name })),
    ],
    [staffOptions],
  );

  const petComboOptions = useMemo<HubComboboxOption[]>(
    () => guardianPets.map((p) => ({ value: p.id, label: p.name })),
    [guardianPets],
  );

  const statusComboOptions = useMemo<HubComboboxOption[]>(
    () =>
      Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label })),
    [],
  );

  // ── Service chips ─────────────────────────────────────────────────────────
  const addService = useCallback(
    (id: string) => {
      if (!id) return;
      const st = serviceTypes.find((s) => s.id === id);
      if (!st) return;
      if (services.some((s) => s.hub_service_type_id === id)) {
        setServiceSearchId('');
        return;
      }
      setServices((prev) => [
        ...prev,
        { hub_service_type_id: id, name: st.name, duration_minutes: st.default_duration_minutes ?? 60 },
      ]);
      setServiceSearchId('');
    },
    [serviceTypes, services],
  );

  const removeService = (idx: number) => setServices((prev) => prev.filter((_, i) => i !== idx));
  const updateServiceDuration = (idx: number, dur: number) =>
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s)));

  // ── Extra blocks ──────────────────────────────────────────────────────────
  const addExtraBlock = () =>
    setExtraBlocks((prev) => [
      ...prev,
      { key: String(Date.now()), services: [], starts_hm: endsHm, ends_hm: addMinutes(endsHm, 60), hub_staff_member_id: staffId, resource_label: resourceLabel },
    ]);
  const removeExtraBlock = (key: string) => setExtraBlocks((prev) => prev.filter((b) => b.key !== key));

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!clinicId) return;
    if (services.length === 0) {
      setSaveError('Selecione pelo menos um serviço.');
      return;
    }
    if (!dateYmd) {
      setSaveError('Informe a data do agendamento.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setConflicts([]);

    try {
      const startsAt = toIsoTs(dateYmd, startsHm);
      const endsAt = toIsoTs(dateYmd, endsHm);

      const payload: CreateHubAppointmentPayload = {
        clinic_id: clinicId,
        hub_service_type_id: services[0]!.hub_service_type_id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: status as HubAppointmentStatus,
        hub_staff_member_id: staffId || null,
        pet_id: petId || null,
        guardian_id: guardianId || null,
        resource_label: resourceLabel || null,
        title: title || null,
        description: description || null,
        services: services.map((s) => ({
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
        })),
      };

      if (withPickup) {
        payload.with_pickup_route_before = {
          starts_at: toIsoTs(dateYmd, pickupBefore.starts_hm),
          ends_at: toIsoTs(dateYmd, pickupBefore.ends_hm),
          hub_staff_member_id: pickupBefore.hub_staff_member_id || null,
          resource_label: pickupBefore.resource_label || null,
        };
        payload.with_pickup_route_after = {
          starts_at: toIsoTs(dateYmd, pickupAfter.starts_hm),
          ends_at: toIsoTs(dateYmd, pickupAfter.ends_hm),
          hub_staff_member_id: pickupAfter.hub_staff_member_id || null,
          resource_label: pickupAfter.resource_label || null,
        };
      }

      if (extraBlocks.length > 0) {
        payload.extra_blocks = extraBlocks
          .filter((b) => b.services.length > 0)
          .map((b) => ({
            starts_at: toIsoTs(dateYmd, b.starts_hm),
            ends_at: toIsoTs(dateYmd, b.ends_hm),
            services: b.services.map((s) => ({
              hub_service_type_id: s.hub_service_type_id,
              duration_minutes: s.duration_minutes,
            })),
            hub_staff_member_id: b.hub_staff_member_id || null,
            resource_label: b.resource_label || null,
          }));
      }

      if (withRecurrence) {
        const rule: HubAppointmentRecurrenceRule = {
          kind: recurrence.kind,
          interval_value: recurrence.interval_value,
          days_of_week: recurrence.kind === 'weekly' && recurrence.days_of_week.length > 0 ? recurrence.days_of_week : undefined,
          day_of_month: recurrence.kind === 'monthly' ? new Date(startsAt).getDate() : undefined,
        };
        if (recurrence.end_kind === 'until' && recurrence.until_date) {
          rule.until_date = recurrence.until_date;
        } else {
          rule.occurrences = recurrence.occurrences;
        }
        payload.recurrence = rule;
      }

      const result = await hubAgendaApi.create(payload);

      if (result.conflicts && result.conflicts.length > 0) {
        setConflicts(result.conflicts);
      }

      onSaved();
      onClose();
      resetForm();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Erro ao criar agendamento';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setServices([]);
    setGuardianId('');
    setPetId('');
    setPetName('');
    setTitle('');
    setDescription('');
    setTitleOverridden(false);
    setWithRecurrence(false);
    setRecurrence({ ...DEFAULT_RECURRENCE });
    setWithPickup(false);
    setExtraBlocks([]);
    setSaveError(null);
    setConflicts([]);
    setResourceLabel('');
    setStatus('confirmed');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ── Aside summary ─────────────────────────────────────────────────────────
  const asideContent = (
    <div className="nam-aside">
      <p className="nam-aside__label">Resumo</p>

      {services.length > 0 && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Serviços</p>
          {services.map((s) => (
            <div key={s.hub_service_type_id} className="nam-aside__row">
              <span className="nam-aside__item">{s.name}</span>
              <span className="nam-aside__muted">{s.duration_minutes}min</span>
            </div>
          ))}
          <div className="nam-aside__total">
            <span>Total</span>
            <strong>{totalDurationMin}min</strong>
          </div>
        </div>
      )}

      {petName && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Pet</p>
          <p className="nam-aside__item">{petName}</p>
          {guardianName && <p className="nam-aside__muted">{guardianName}</p>}
        </div>
      )}

      {dateYmd && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Horário</p>
          <p className="nam-aside__item">{dateYmd.split('-').reverse().join('/')}</p>
          <p className="nam-aside__muted">{startsHm} – {endsHm}</p>
        </div>
      )}

      {withRecurrence && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Repetição</p>
          <p className="nam-aside__item">
            {recurrence.kind === 'daily' ? 'Diária' : recurrence.kind === 'weekly' ? 'Semanal' : 'Mensal'}
            {recurrence.interval_value > 1 ? ` a cada ${recurrence.interval_value}` : ''}
          </p>
          {recurrence.end_kind === 'occurrences'
            ? <p className="nam-aside__muted">{recurrence.occurrences} ocorrências</p>
            : <p className="nam-aside__muted">até {recurrence.until_date}</p>}
        </div>
      )}

      {withPickup && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Leva e Traz</p>
          <p className="nam-aside__item">Busca {pickupBefore.starts_hm}</p>
          <p className="nam-aside__item">Retorno {pickupAfter.ends_hm}</p>
        </div>
      )}

      {extraBlocks.length > 0 && (
        <div className="nam-aside__section">
          <p className="nam-aside__section-title">Blocos adicionais</p>
          {extraBlocks.map((b, i) => (
            <p key={b.key} className="nam-aside__item">Bloco {i + 2}: {b.starts_hm}–{b.ends_hm}</p>
          ))}
        </div>
      )}
    </div>
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = (
    <>
      {saveError && (
        <span className="nam-footer-error">
          <AlertCircle size={14} /> {saveError}
        </span>
      )}
      <button className="hub-btn hub-btn--ghost" type="button" onClick={handleClose} disabled={saving}>
        Cancelar
      </button>
      <button className="hub-btn hub-btn--primary" type="button" onClick={handleSave} disabled={saving || !clinicId}>
        {saving ? 'Salvando…' : withRecurrence ? 'Criar série' : 'Criar agendamento'}
      </button>
    </>
  );

  return (
    <HubModal
      open={open}
      onClose={handleClose}
      title="Novo agendamento"
      subtitle={title || autoTitle || undefined}
      size="xl"
      footer={footer}
      aside={asideContent}
    >
      <div className="nam-form">
        {/* ── 1. Tipo de serviço (grupo) ───────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Grupo de serviço</label>
              <HubSearchableCombobox
                id="nam-group"
                options={groups}
                value={groupFilter}
                onChange={setGroupFilter}
                clearable={false}
                placeholder="Todos os grupos"
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Situação</label>
              <HubSearchableCombobox
                id="nam-status"
                options={statusComboOptions}
                value={status}
                onChange={(v) => setStatus(v as AgendaStatus)}
                clearable={false}
              />
            </div>
          </div>
        </div>

        {/* ── 2. Serviços ──────────────────────────────────────────────── */}
        <div className="nam-section">
          <label className="nam-label">Serviços</label>
          <HubSearchableCombobox
            id="nam-service-search"
            options={serviceComboOptions}
            value={serviceSearchId}
            onChange={addService}
            placeholder="Buscar e adicionar serviço…"
            clearable={false}
          />
          {services.length > 0 && (
            <div className="nam-chips">
              {services.map((chip, idx) => (
                <div key={chip.hub_service_type_id} className="nam-chip">
                  <GripVertical size={14} className="nam-chip__drag" />
                  <span className="nam-chip__name">{chip.name}</span>
                  <input
                    className="nam-chip__dur"
                    type="number"
                    min={1}
                    max={480}
                    value={chip.duration_minutes}
                    onChange={(e) => updateServiceDuration(idx, Number(e.target.value))}
                    aria-label="Duração em minutos"
                  />
                  <span className="nam-chip__unit">min</span>
                  <button className="nam-chip__remove" type="button" onClick={() => removeService(idx)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="nam-chips__total">
                Total: <strong>{totalDurationMin} min</strong>
              </div>
            </div>
          )}
        </div>

        {/* ── 3 + 4. Profissional / Recurso ────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Profissional</label>
              <HubSearchableCombobox
                id="nam-staff"
                options={staffComboOptions}
                value={staffId}
                onChange={setStaffId}
                placeholder="Não atribuído"
                clearable={false}
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Recurso / Sala</label>
              <input
                className="nam-input"
                type="text"
                placeholder="Ex.: Mesa 1, Van…"
                value={resourceLabel}
                onChange={(e) => setResourceLabel(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── 5. Tutor + Pet ────────────────────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols2">
            <div className="nam-field">
              <label className="nam-label">Tutor</label>
              {guardiansLoading ? (
                <p className="nam-muted">Carregando tutores…</p>
              ) : (
                <HubSearchableCombobox
                  id="nam-guardian"
                  options={guardianOptions}
                  value={guardianId}
                  onChange={(v) => {
                    setGuardianId(v);
                    setGuardianName(guardianOptions.find((o) => o.value === v)?.label ?? '');
                  }}
                  placeholder="Buscar tutor…"
                />
              )}
            </div>
            <div className="nam-field">
              <label className="nam-label">Pet</label>
              {guardianId ? (
                petComboOptions.length > 0 ? (
                  <HubSearchableCombobox
                    id="nam-pet"
                    options={petComboOptions}
                    value={petId}
                    onChange={(v) => {
                      setPetId(v);
                      setPetName(petComboOptions.find((o) => o.value === v)?.label ?? '');
                    }}
                    placeholder="Selecionar pet…"
                  />
                ) : (
                  <p className="nam-muted">Nenhum pet cadastrado</p>
                )
              ) : (
                <p className="nam-muted">Selecione um tutor primeiro</p>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. Data / Hora ────────────────────────────────────────────── */}
        <div className="nam-section">
          <div className="nam-row nam-row--cols3">
            <div className="nam-field">
              <label className="nam-label">Data</label>
              <HubBrDateInput id="nam-date" valueIso={dateYmd} onChangeIso={setDateYmd} />
            </div>
            <div className="nam-field">
              <label className="nam-label">Início</label>
              <input
                className="nam-input"
                type="time"
                value={startsHm}
                onChange={(e) => setStartsHm(e.target.value)}
              />
            </div>
            <div className="nam-field">
              <label className="nam-label">Fim previsto</label>
              <input
                className="nam-input"
                type="time"
                value={endsHm}
                onChange={(e) => setEndsHm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── 7. Título ─────────────────────────────────────────────────── */}
        <div className="nam-section">
          <label className="nam-label">Título</label>
          <div className="nam-title-row">
            <input
              className="nam-input"
              type="text"
              maxLength={200}
              placeholder={autoTitle || 'Título do agendamento…'}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleOverridden(true);
              }}
            />
            {titleOverridden && (
              <button
                className="nam-btn-icon"
                type="button"
                title="Restaurar sugestão automática"
                onClick={() => {
                  setTitleOverridden(false);
                  setTitle(autoTitle);
                }}
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── 8. Descrição ──────────────────────────────────────────────── */}
        <div className="nam-section">
          <label className="nam-label">Observações</label>
          <textarea
            className="nam-textarea"
            rows={3}
            maxLength={300}
            placeholder="Observações sobre o atendimento…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="nam-char-count">{description.length}/300</p>
        </div>

        {/* ── 9. Repetição ─────────────────────────────────────────────── */}
        <div className="nam-section">
          <label className="nam-checkbox-label">
            <input
              type="checkbox"
              checked={withRecurrence}
              onChange={(e) => setWithRecurrence(e.target.checked)}
            />
            <CalendarDays size={15} />
            Repetir agendamento
          </label>

          {withRecurrence && (
            <div className="nam-recurrence">
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Frequência</label>
                  <select
                    className="nam-select"
                    value={recurrence.kind}
                    onChange={(e) =>
                      setRecurrence((r) => ({ ...r, kind: e.target.value as RecurrenceForm['kind'] }))
                    }
                  >
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>
                <div className="nam-field">
                  <label className="nam-label">A cada</label>
                  <input
                    className="nam-input"
                    type="number"
                    min={1}
                    max={12}
                    value={recurrence.interval_value}
                    onChange={(e) => setRecurrence((r) => ({ ...r, interval_value: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {recurrence.kind === 'weekly' && (
                <div className="nam-dow-chips">
                  {DOW_LABELS.map((label, i) => {
                    const dow = i + 1;
                    const active = recurrence.days_of_week.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        className={`nam-dow-chip${active ? ' nam-dow-chip--active' : ''}`}
                        onClick={() =>
                          setRecurrence((r) => ({
                            ...r,
                            days_of_week: active
                              ? r.days_of_week.filter((d) => d !== dow)
                              : [...r.days_of_week, dow],
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Termina</label>
                  <select
                    className="nam-select"
                    value={recurrence.end_kind}
                    onChange={(e) =>
                      setRecurrence((r) => ({ ...r, end_kind: e.target.value as 'until' | 'occurrences' }))
                    }
                  >
                    <option value="occurrences">Após N ocorrências</option>
                    <option value="until">Até data</option>
                  </select>
                </div>
                <div className="nam-field">
                  {recurrence.end_kind === 'occurrences' ? (
                    <>
                      <label className="nam-label">Ocorrências</label>
                      <input
                        className="nam-input"
                        type="number"
                        min={1}
                        max={52}
                        value={recurrence.occurrences}
                        onChange={(e) => setRecurrence((r) => ({ ...r, occurrences: Number(e.target.value) }))}
                      />
                    </>
                  ) : (
                    <>
                      <label className="nam-label">Até</label>
                      <HubBrDateInput
                        id="nam-recur-until"
                        valueIso={recurrence.until_date}
                        onChangeIso={(v) => setRecurrence((r) => ({ ...r, until_date: v }))}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 10. L&T ──────────────────────────────────────────────────── */}
        <div className="nam-section">
          <label className="nam-checkbox-label">
            <input
              type="checkbox"
              checked={withPickup}
              onChange={(e) => setWithPickup(e.target.checked)}
            />
            Incluir Leva e Traz
          </label>

          {withPickup && (
            <div className="nam-pickup">
              <p className="nam-pickup__title">Busca (antes do atendimento)</p>
              <div className="nam-row nam-row--cols3">
                <div className="nam-field">
                  <label className="nam-label">Início</label>
                  <input className="nam-input" type="time" value={pickupBefore.starts_hm}
                    onChange={(e) => setPickupBefore((b) => ({ ...b, starts_hm: e.target.value }))} />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Fim</label>
                  <input className="nam-input" type="time" value={pickupBefore.ends_hm}
                    onChange={(e) => setPickupBefore((b) => ({ ...b, ends_hm: e.target.value }))} />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Motorista</label>
                  <HubSearchableCombobox
                    id="nam-pickup-before-staff"
                    options={staffComboOptions}
                    value={pickupBefore.hub_staff_member_id}
                    onChange={(v) => setPickupBefore((b) => ({ ...b, hub_staff_member_id: v }))}
                    placeholder="Não atribuído"
                    clearable={false}
                  />
                </div>
              </div>

              <p className="nam-pickup__title" style={{ marginTop: 12 }}>Retorno (após atendimento)</p>
              <div className="nam-row nam-row--cols3">
                <div className="nam-field">
                  <label className="nam-label">Início</label>
                  <input className="nam-input" type="time" value={pickupAfter.starts_hm}
                    onChange={(e) => setPickupAfter((b) => ({ ...b, starts_hm: e.target.value }))} />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Fim</label>
                  <input className="nam-input" type="time" value={pickupAfter.ends_hm}
                    onChange={(e) => setPickupAfter((b) => ({ ...b, ends_hm: e.target.value }))} />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Motorista</label>
                  <HubSearchableCombobox
                    id="nam-pickup-after-staff"
                    options={staffComboOptions}
                    value={pickupAfter.hub_staff_member_id}
                    onChange={(v) => setPickupAfter((b) => ({ ...b, hub_staff_member_id: v }))}
                    placeholder="Não atribuído"
                    clearable={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 11. Outros blocos no dia ──────────────────────────────────── */}
        <div className="nam-section">
          {extraBlocks.map((block, bIdx) => (
            <ExtraBlockCard
              key={block.key}
              block={block}
              index={bIdx}
              serviceComboOptions={serviceComboOptions}
              staffComboOptions={staffComboOptions}
              serviceTypes={serviceTypes}
              onRemove={() => removeExtraBlock(block.key)}
              onChange={(updated) =>
                setExtraBlocks((prev) => prev.map((b) => (b.key === block.key ? updated : b)))
              }
            />
          ))}
          <button className="nam-btn-add-block" type="button" onClick={addExtraBlock}>
            <Plus size={14} /> Adicionar outro bloco no dia
          </button>
        </div>

        {/* ── Conflict feedback ─────────────────────────────────────────── */}
        {conflicts.length > 0 && (
          <div className="nam-conflicts">
            <AlertCircle size={15} />
            <div>
              <p><strong>Algumas datas entraram em conflito:</strong></p>
              {conflicts.map((c, i) => (
                <p key={i} className="nam-conflict-row">
                  {c.date}: {c.reason}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </HubModal>
  );
};

// ── ExtraBlockCard sub-component ─────────────────────────────────────────────

type ExtraBlockCardProps = {
  block: ExtraBlock;
  index: number;
  serviceComboOptions: HubComboboxOption[];
  staffComboOptions: HubComboboxOption[];
  serviceTypes: HubServiceType[];
  onRemove: () => void;
  onChange: (updated: ExtraBlock) => void;
};

const ExtraBlockCard: React.FC<ExtraBlockCardProps> = ({
  block, index, serviceComboOptions, staffComboOptions, serviceTypes, onRemove, onChange,
}) => {
  const [svcSearchId, setSvcSearchId] = useState('');

  const addSvc = (id: string) => {
    if (!id) return;
    if (block.services.some((s) => s.hub_service_type_id === id)) { setSvcSearchId(''); return; }
    const st = serviceTypes.find((s) => s.id === id);
    if (!st) return;
    onChange({ ...block, services: [...block.services, { hub_service_type_id: id, name: st.name, duration_minutes: st.default_duration_minutes ?? 60 }] });
    setSvcSearchId('');
  };

  const removeSvc = (svcId: string) =>
    onChange({ ...block, services: block.services.filter((s) => s.hub_service_type_id !== svcId) });

  return (
    <div className="nam-extra-block">
      <div className="nam-extra-block__header">
        <span className="nam-extra-block__title">Bloco {index + 2}</span>
        <button className="nam-btn-icon nam-btn-icon--danger" type="button" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="nam-row nam-row--cols2">
        <div className="nam-field">
          <label className="nam-label">Início</label>
          <input className="nam-input" type="time" value={block.starts_hm}
            onChange={(e) => onChange({ ...block, starts_hm: e.target.value })} />
        </div>
        <div className="nam-field">
          <label className="nam-label">Fim</label>
          <input className="nam-input" type="time" value={block.ends_hm}
            onChange={(e) => onChange({ ...block, ends_hm: e.target.value })} />
        </div>
      </div>

      <div className="nam-field" style={{ marginTop: 8 }}>
        <label className="nam-label">Profissional</label>
        <HubSearchableCombobox
          id={`nam-eb-staff-${block.key}`}
          options={staffComboOptions}
          value={block.hub_staff_member_id}
          onChange={(v) => onChange({ ...block, hub_staff_member_id: v })}
          placeholder="Não atribuído"
          clearable={false}
        />
      </div>

      <div className="nam-field" style={{ marginTop: 8 }}>
        <label className="nam-label">Serviços do bloco</label>
        <HubSearchableCombobox
          id={`nam-eb-svc-${block.key}`}
          options={serviceComboOptions}
          value={svcSearchId}
          onChange={addSvc}
          placeholder="Adicionar serviço…"
          clearable={false}
        />
        <div className="nam-chips nam-chips--compact">
          {block.services.map((s) => (
            <div key={s.hub_service_type_id} className="nam-chip">
              <span className="nam-chip__name">{s.name}</span>
              <span className="nam-chip__unit">{s.duration_minutes}min</span>
              <button className="nam-chip__remove" type="button" onClick={() => removeSvc(s.hub_service_type_id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
