import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { apiRequest, getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubEncountersApi, type DayBoardItem } from '../../api/hubClinicalApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import {
  dayRangeIsoLocal,
  isUuid,
  loadAgendaPersistedFilters,
  saveAgendaPersistedUnit,
} from '../agenda/agendaFilters';
import ClinicDayMetrics from './ClinicDayMetrics';
import ClinicQueueBoard from './ClinicQueueBoard';
import ClinicWalkInPanel from './ClinicWalkInPanel';
import ClinicAlertsBanner from './ClinicAlertsBanner';
import StartEncounterModal from './StartEncounterModal';
import type { NewAppointmentInitial } from '../agenda/NewAppointmentModal';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import type { CareLocationValue } from '../../components/CareLocationFields';
import '../agenda/new-appointment-modal.css';

const HubClinicEncountersPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.clinic.write');
  const accessAllowed = hasPermission('hub.clinic.read');

  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<DayBoardItem[]>([]);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [creatingWalkIn, setCreatingWalkIn] = useState(false);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [staffFilter, setStaffFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState(() => loadAgendaPersistedFilters().unit ?? 'all');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [clinicalTypesConfigured, setClinicalTypesConfigured] = useState(true);
  const [startModalItem, setStartModalItem] = useState<DayBoardItem | null>(null);
  const [startingEncounter, setStartingEncounter] = useState(false);

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);

  const unitIdParam = useMemo(() => {
    if (unitFilter === 'all') return undefined;
    if (isUuid(unitFilter)) return unitFilter;
    const match = units.find((u) => u.name === unitFilter);
    return match?.id;
  }, [unitFilter, units]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    begin();
    try {
      const res = await hubEncountersApi.dayBoard(clinicId, dayRange, {
        staffId: staffFilter || undefined,
        unitId: unitIdParam,
      });
      setItems(res.items ?? []);
      setClinicalTypesConfigured(res.clinical_types_configured !== false);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar atendimentos');
      setItems([]);
      setClinicalTypesConfigured(true);
    } finally {
      finish();
    }
  }, [clinicId, dayRange, staffFilter, unitIdParam, showError, begin, succeed, finish]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  useEffect(() => {
    if (!clinicId) return;
    void hubStaffApi.list(clinicId).then((r) => setStaff(r.staff ?? [])).catch(() => setStaff([]));
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => setUnits(r.units ?? []))
      .catch(() => setUnits([]));
  }, [clinicId]);

  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    saveAgendaPersistedUnit(value);
  };

  const unitOptions: HubComboboxOption[] = useMemo(() => {
    const rows: HubComboboxOption[] = [{ value: 'all', label: 'Todas as unidades' }];
    for (const u of units) {
      rows.push({ value: u.id, label: u.name });
    }
    if (unitFilter !== 'all' && !rows.some((o) => o.value === unitFilter)) {
      rows.push({ value: unitFilter, label: unitFilter });
    }
    return rows;
  }, [units, unitFilter]);

  const staffOptions: HubComboboxOption[] = useMemo(
    () => [
      { value: '', label: 'Todos os profissionais' },
      ...staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    ],
    [staff],
  );

  const openAgendaForScheduling = useCallback(
    (initial: NewAppointmentInitial) => {
      setWalkInOpen(false);
      navigate('/hub/appointments', {
        state: {
          openClinicalCreate: true,
          clinicalIntakeInitial: initial,
        },
      });
    },
    [navigate],
  );

  const openAgendaForWalkIn = useCallback(
    (initial: NewAppointmentInitial) => {
      setWalkInOpen(false);
      navigate('/hub/appointments?openWalkIn=1', {
        state: { walkInInitial: initial },
      });
    },
    [navigate],
  );

  const shiftDay = (delta: number) => {
    setCursor((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const createWalkIn = async (payload: {
    petId?: string | null;
    guardianId?: string | null;
    staffId?: string | null;
    complaint: string;
    hubServiceTypeId: string;
    entryKind: 'routine' | 'emergency';
    durationMinutes: number;
    careLocation?: CareLocationValue;
  }) => {
    if (!clinicId) return;
    setCreatingWalkIn(true);
    try {
      const now = new Date();
      const endsAt = new Date(now.getTime() + payload.durationMinutes * 60_000);
      await hubAgendaApi.create({
        clinic_id: clinicId,
        unit_id: getSelectedUnitId(),
        hub_service_type_id: payload.hubServiceTypeId,
        hub_staff_member_id: payload.staffId ?? null,
        pet_id: payload.petId ?? null,
        guardian_id: payload.guardianId ?? null,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'checked_in',
        notes: payload.complaint.trim() || null,
        title: payload.complaint.trim() ? payload.complaint.trim().slice(0, 200) : 'Atendimento clínico',
        appointment_kind: payload.entryKind === 'emergency' ? 'clinical_emergency' : 'clinical_walk_in',
        care_location_kind: payload.careLocation?.care_location_kind ?? 'own_unit',
        hub_partner_clinic_id:
          payload.careLocation?.care_location_kind === 'partner_clinic'
            ? payload.careLocation.hub_partner_clinic_id
            : null,
      });
      setWalkInOpen(false);
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar entrada na fila');
      throw e;
    } finally {
      setCreatingWalkIn(false);
    }
  };

  const openItem = (item: DayBoardItem) => {
    if (!clinicId || !canWrite) return;
    if (item.kind === 'encounter' && item.encounter_id) {
      navigate(`/hub/clinica/atendimentos/${item.encounter_id}`);
      return;
    }
    if (item.kind === 'appointment_slot') {
      setStartModalItem(item);
    }
  };

  const handleStartEncounter = async (
    item: DayBoardItem,
    opts: { hub_case_id?: string | null; create_new_case?: boolean; new_case_title?: string | null },
  ) => {
    if (!clinicId || !item.appointment_id) return;
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.openFromAppointment(clinicId, item.appointment_id, opts);
      setStartModalItem(null);
      navigate(`/hub/clinica/atendimentos/${encounter.id}`);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao iniciar atendimento');
    } finally {
      setStartingEncounter(false);
    }
  };

  if (!permLoading && !clinicId) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para acessar os atendimentos.</p>;
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  const dateLabel = cursor.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className={`hub-clinic-atendimentos${embedded ? ' hub-clinic-atendimentos--embedded' : ''}`}>
      <ClinicAlertsBanner clinicId={clinicId!} />

      {!clinicalTypesConfigured && !loading ? (
        <div className="hub-clinic-banner">
          <p>
            Configure tipos de serviço com grupo <strong>Clínica</strong>, <strong>Internação</strong> ou{' '}
            <strong>Cirurgia</strong> para ver agendamentos da Agenda nesta fila.
          </p>
          <Link to="/hub/servicos" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm">
            Configurar serviços
          </Link>
        </div>
      ) : null}

      <div className="hub-clientes__toolbar hub-clinic-atendimentos__toolbar">
        <div className="hub-clinic-atendimentos__date-nav">
          <button
            type="button"
            className="hub-clientes__icon-btn"
            onClick={() => shiftDay(-1)}
            aria-label="Dia anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="hub-clinic-atendimentos__date-label">{dateLabel}</span>
          <button
            type="button"
            className="hub-clientes__icon-btn"
            onClick={() => shiftDay(1)}
            aria-label="Próximo dia"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="hub-clientes__search hub-clinic-atendimentos__search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Buscar pet ou tutor…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
          <HubSearchableCombobox
            id="hub-clinic-unit-filter"
            className="hub-combobox--clientes"
            options={unitOptions}
            value={unitFilter}
            onChange={handleUnitFilterChange}
            placeholder="Unidade"
            allowCreate={false}
          />
        </div>
        <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
          <HubSearchableCombobox
            id="hub-clinic-staff-filter"
            className="hub-combobox--clientes"
            options={staffOptions}
            value={staffFilter}
            onChange={setStaffFilter}
            placeholder="Profissional"
            allowCreate={false}
          />
        </div>
        {canWrite ? (
          <button type="button" className="hub-btn hub-btn--primary" onClick={() => setWalkInOpen(true)}>
            Nova entrada na fila
          </button>
        ) : null}
      </div>

      {items.length > 0 || !loading ? <ClinicDayMetrics items={items} /> : null}
      <HubRefreshingBanner show={refreshing} label="Atualizando fila…" />

      {loading && items.length === 0 ? (
        <HubLoading variant="block" label="Carregando fila clínica…" className="hub-clinic-page__pad" />
      ) : items.length === 0 ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">Nenhum atendimento clínico neste dia.</p>
      ) : (
        <ClinicQueueBoard items={items} canWrite={canWrite} onOpen={(i) => void openItem(i)} searchQ={searchQ} />
      )}

      <ClinicWalkInPanel
        open={walkInOpen}
        clinicId={clinicId!}
        onClose={() => setWalkInOpen(false)}
        onSubmit={createWalkIn}
        onScheduleAgenda={openAgendaForScheduling}
        onWalkInAgenda={openAgendaForWalkIn}
        submitting={creatingWalkIn}
      />

      <StartEncounterModal
        open={startModalItem !== null}
        clinicId={clinicId!}
        item={startModalItem}
        onClose={() => setStartModalItem(null)}
        onStart={handleStartEncounter}
        starting={startingEncounter}
      />
    </div>
  );
};

export default HubClinicEncountersPage;
