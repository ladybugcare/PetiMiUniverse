import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { apiRequest, getStoredClinicId, usePermissions } from '@petimi/web-core';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubTimeField } from '../../components/HubTimeField';
import { useAlert } from '../../components/AlertProvider';
import {
  hubBoardingApi,
  type BoardingDaycareShift,
  type BoardingOverbookingPolicy,
  type BoardingRecreationWindow,
  type BoardingSpace,
  type BoardingSpaceKind,
  type BoardingSpaceMode,
} from '../../api/hubBoardingApi';
import { isUuid, loadAgendaPersistedFilters, saveAgendaPersistedUnit } from '../agenda/agendaFilters';
import { SPACE_KIND_LABELS, SPACE_MODE_LABELS } from './boardingCareUi';

type SettingsDraft = {
  hotel_slots: string;
  daycare_slots_per_shift: string;
  checkout_cutoff_time: string;
  overbooking_policy: BoardingOverbookingPolicy;
  daycare_shifts: BoardingDaycareShift[];
  recreation_windows: BoardingRecreationWindow[];
  recreation_capacity: string;
};

type SpaceDraft = {
  id: string | null;
  name: string;
  kind: BoardingSpaceKind;
  mode: BoardingSpaceMode;
  capacity: string;
  notes: string;
  active: boolean;
};

const EMPTY_SETTINGS: SettingsDraft = {
  hotel_slots: '',
  daycare_slots_per_shift: '',
  checkout_cutoff_time: '',
  overbooking_policy: 'warn',
  daycare_shifts: [],
  recreation_windows: [],
  recreation_capacity: '',
};

function intOrNull(v: string): number | null {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shiftKey(label: string, idx: number): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `turno_${idx + 1}`;
}

const HubBoardingSettingsPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const canManage = hasPermission('boarding.reservations.manage');
  const clinicId = getStoredClinicId();
  const { showError, showSuccess, showConfirm } = useAlert();

  const [units, setUnits] = useState<{ id: string; name: string }[] | null>(null);
  const [unitId, setUnitId] = useState<string>(() => {
    const u = loadAgendaPersistedFilters().unit;
    return u && isUuid(u) ? u : '';
  });
  const [draft, setDraft] = useState<SettingsDraft>(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [spaces, setSpaces] = useState<BoardingSpace[]>([]);
  const [spaceDraft, setSpaceDraft] = useState<SpaceDraft | null>(null);
  const [spaceBusy, setSpaceBusy] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    void (apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}?activeOnly=true`) as Promise<{
      units?: { id: string; name: string }[];
    }>)
      .then((r) => {
        const list = r.units ?? [];
        setUnits(list);
        setUnitId((cur) => (cur && list.some((u) => u.id === cur) ? cur : list[0]?.id ?? ''));
      })
      .catch(() => setUnits([]));
  }, [clinicId]);

  const load = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setLoadingSettings(true);
    try {
      const [s, sp] = await Promise.all([
        hubBoardingApi.getUnitSettings(clinicId, unitId),
        hubBoardingApi.spaces(clinicId, { unitId, includeInactive: true }),
      ]);
      const row = s.settings?.find((x) => x.unit_id === unitId) ?? s.settings?.[0] ?? null;
      setDraft({
        hotel_slots: row?.hotel_slots != null ? String(row.hotel_slots) : '',
        daycare_slots_per_shift: row?.daycare_slots_per_shift != null ? String(row.daycare_slots_per_shift) : '',
        checkout_cutoff_time: row?.checkout_cutoff_time?.slice(0, 5) ?? '',
        overbooking_policy: row?.overbooking_policy ?? 'warn',
        daycare_shifts: row?.daycare_shifts ?? [],
        recreation_windows: row?.recreation_windows ?? [],
        recreation_capacity: row?.recreation_capacity != null ? String(row.recreation_capacity) : '',
      });
      setSpaces(sp.spaces ?? []);
      setDirty(false);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar configurações');
    } finally {
      setLoadingSettings(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const unitOptions: HubComboboxOption[] = useMemo(
    () => (units ?? []).map((u) => ({ value: u.id, label: u.name })),
    [units],
  );

  const update = (patch: Partial<SettingsDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const saveSettings = async () => {
    if (!clinicId || !unitId) return;
    const shifts = draft.daycare_shifts
      .filter((s) => s.label.trim() && s.start && s.end)
      .map((s, idx) => ({ ...s, label: s.label.trim(), key: s.key || shiftKey(s.label, idx) }))
      .map((s, idx, all) => (all.findIndex((x) => x.key === s.key) === idx ? s : { ...s, key: `${s.key}_${idx + 1}` }));
    if (shifts.some((s) => s.end <= s.start)) {
      showError('Em cada turno, o fim precisa ser depois do início.');
      return;
    }
    setSaving(true);
    try {
      await hubBoardingApi.patchUnitSettings({
        clinic_id: clinicId,
        unit_id: unitId,
        hotel_slots: intOrNull(draft.hotel_slots),
        daycare_slots_per_shift: intOrNull(draft.daycare_slots_per_shift),
        checkout_cutoff_time: draft.checkout_cutoff_time || null,
        overbooking_policy: draft.overbooking_policy,
        daycare_shifts: shifts,
        recreation_windows: draft.recreation_windows
          .filter((w) => w.start)
          .map((w) => ({ start: w.start, end: w.end || null, label: w.label?.trim() || null })),
        recreation_capacity: intOrNull(draft.recreation_capacity),
      });
      showSuccess('Configurações salvas');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const saveSpace = async () => {
    if (!clinicId || !spaceDraft) return;
    const capacity = intOrNull(spaceDraft.capacity);
    if (!spaceDraft.name.trim() || !capacity) {
      showError('Informe nome e capacidade da acomodação.');
      return;
    }
    setSpaceBusy(true);
    try {
      const body = {
        clinic_id: clinicId,
        name: spaceDraft.name.trim(),
        kind: spaceDraft.kind,
        mode: spaceDraft.mode,
        capacity,
        notes: spaceDraft.notes.trim() || null,
      };
      if (spaceDraft.id) await hubBoardingApi.patchSpace(spaceDraft.id, { ...body, active: spaceDraft.active });
      else await hubBoardingApi.createSpace({ ...body, unit_id: unitId || null });
      setSpaceDraft(null);
      showSuccess('Acomodação salva');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar acomodação');
    } finally {
      setSpaceBusy(false);
    }
  };

  const removeSpace = (space: BoardingSpace) => {
    if (!clinicId) return;
    showConfirm(
      `Remover ${space.name}? Estadias que já usaram esta acomodação mantêm o histórico.`,
      async () => {
        try {
          await hubBoardingApi.deleteSpace(space.id, clinicId);
          setSpaceDraft(null);
          await load();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao remover acomodação');
        }
      },
      'Remover acomodação',
    );
  };

  if (permLoading) return <HubLoading variant="block" />;
  if (!canManage) return <Navigate to="/hub/hotel-creche" replace />;
  if (!clinicId) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Selecione uma clínica para configurar Hotel & Creche.</p>;
  }
  if (units === null) return <HubLoading variant="block" label="Carregando unidades…" />;
  if (!units.length) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Cadastre uma unidade para configurar Hotel & Creche.</p>;
  }

  return (
    <div className="hub-boarding-settings">
      <div className="hub-clientes__toolbar hub-boarding-settings__toolbar">
        <div className="hub-servicos__filter-field hub-clinic-atendimentos__staff-filter">
          <HubSearchableCombobox
            id="hub-boarding-settings-unit"
            className="hub-combobox--clientes"
            options={unitOptions}
            value={unitId}
            onChange={(v) => {
              setUnitId(v);
              saveAgendaPersistedUnit(v);
            }}
            placeholder="Unidade"
            allowCreate={false}
          />
        </div>
        {loadingSettings ? <HubLoading variant="inline" size="sm" label="Carregando…" /> : null}
      </div>

      <section className="hub-boarding-settings__section">
        <h3 className="hub-grooming-drawer__heading">Capacidade</h3>
        <p className="hub-grooming-drawer__hint">Vagas totais da unidade. Deixe em branco para não controlar.</p>
        <div className="hub-boarding-care__grid">
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="bs-hotel-slots">
              Vagas de hotel
            </label>
            <input
              id="bs-hotel-slots"
              className="hub-clientes__input"
              inputMode="numeric"
              value={draft.hotel_slots}
              onChange={(e) => update({ hotel_slots: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="bs-daycare-slots">
              Cães por turno na creche
            </label>
            <input
              id="bs-daycare-slots"
              className="hub-clientes__input"
              inputMode="numeric"
              value={draft.daycare_slots_per_shift}
              onChange={(e) => update({ daycare_slots_per_shift: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </div>
        <div className="hub-clientes__field">
          <span className="hub-clientes__label">Quando lotar</span>
          <div className="hub-clientes__btn-row">
            {(
              [
                ['warn', 'Avisar e permitir confirmar'],
                ['block', 'Bloquear novas entradas'],
              ] as [BoardingOverbookingPolicy, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={draft.overbooking_policy === id}
                className={`hub-clientes__btn hub-clientes__btn--sm ${draft.overbooking_policy === id ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                onClick={() => update({ overbooking_policy: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="hub-boarding-settings__section">
        <h3 className="hub-grooming-drawer__heading">Diária do hotel</h3>
        <p className="hub-grooming-drawer__hint">
          Saída depois deste horário cobra mais uma diária. Sem horário, a cobrança segue as noites da estadia.
        </p>
        <div className="hub-boarding-settings__narrow">
          <HubTimeField
            id="bs-cutoff"
            label="Horário limite de saída"
            valueHm={draft.checkout_cutoff_time}
            onChangeHm={(v) => update({ checkout_cutoff_time: v })}
          />
        </div>
      </section>

      <section className="hub-boarding-settings__section">
        <h3 className="hub-grooming-drawer__heading">Turnos da creche</h3>
        <p className="hub-grooming-drawer__hint">A capacidade da creche é contada por turno.</p>
        {draft.daycare_shifts.length ? (
          <ul className="hub-boarding-care__list">
            {draft.daycare_shifts.map((s, idx) => (
              <li key={s.key || idx} className="hub-boarding-settings__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor={`bs-shift-${idx}`}>
                    Nome
                  </label>
                  <input
                    id={`bs-shift-${idx}`}
                    className="hub-clientes__input"
                    value={s.label}
                    placeholder="Manhã"
                    onChange={(e) =>
                      update({
                        daycare_shifts: draft.daycare_shifts.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                      })
                    }
                  />
                </div>
                <HubTimeField
                  id={`bs-shift-${idx}-start`}
                  label="Início"
                  valueHm={s.start}
                  onChangeHm={(v) =>
                    update({ daycare_shifts: draft.daycare_shifts.map((x, i) => (i === idx ? { ...x, start: v } : x)) })
                  }
                />
                <HubTimeField
                  id={`bs-shift-${idx}-end`}
                  label="Fim"
                  valueHm={s.end}
                  onChangeHm={(v) =>
                    update({ daycare_shifts: draft.daycare_shifts.map((x, i) => (i === idx ? { ...x, end: v } : x)) })
                  }
                />
                <button
                  type="button"
                  className="hub-clientes__icon-btn hub-boarding-settings__remove"
                  aria-label={`Remover turno ${s.label}`}
                  onClick={() => update({ daycare_shifts: draft.daycare_shifts.filter((_, i) => i !== idx) })}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__muted">Sem turnos: a creche conta o dia inteiro.</p>
        )}
        <button
          type="button"
          className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
          onClick={() =>
            update({
              daycare_shifts: [
                ...draft.daycare_shifts,
                draft.daycare_shifts.length === 0
                  ? { key: '', label: 'Manhã', start: '07:00', end: '12:00' }
                  : { key: '', label: 'Tarde', start: '13:00', end: '19:00' },
              ],
            })
          }
        >
          <Plus size={14} aria-hidden /> Adicionar turno
        </button>
      </section>

      <section className="hub-boarding-settings__section">
        <h3 className="hub-grooming-drawer__heading">Recreação</h3>
        <p className="hub-grooming-drawer__hint">
          Horários em que a recreação entra na rotina dos pets liberados para grupo. É uma tarefa da estadia, não uma
          reserva a mais.
        </p>
        {draft.recreation_windows.length ? (
          <ul className="hub-boarding-care__list">
            {draft.recreation_windows.map((w, idx) => (
              <li key={idx} className="hub-boarding-settings__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor={`bs-rec-${idx}`}>
                    Nome
                  </label>
                  <input
                    id={`bs-rec-${idx}`}
                    className="hub-clientes__input"
                    value={w.label ?? ''}
                    placeholder="Pátio"
                    onChange={(e) =>
                      update({
                        recreation_windows: draft.recreation_windows.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                      })
                    }
                  />
                </div>
                <HubTimeField
                  id={`bs-rec-${idx}-start`}
                  label="Início"
                  valueHm={w.start}
                  onChangeHm={(v) =>
                    update({ recreation_windows: draft.recreation_windows.map((x, i) => (i === idx ? { ...x, start: v } : x)) })
                  }
                />
                <HubTimeField
                  id={`bs-rec-${idx}-end`}
                  label="Fim"
                  valueHm={w.end ?? ''}
                  onChangeHm={(v) =>
                    update({ recreation_windows: draft.recreation_windows.map((x, i) => (i === idx ? { ...x, end: v } : x)) })
                  }
                />
                <button
                  type="button"
                  className="hub-clientes__icon-btn hub-boarding-settings__remove"
                  aria-label="Remover horário de recreação"
                  onClick={() => update({ recreation_windows: draft.recreation_windows.filter((_, i) => i !== idx) })}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__muted">Sem horários: recreação só quando registrada pela equipe.</p>
        )}
        <button
          type="button"
          className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
          onClick={() =>
            update({ recreation_windows: [...draft.recreation_windows, { start: '10:00', end: '11:00', label: '' }] })
          }
        >
          <Plus size={14} aria-hidden /> Adicionar horário
        </button>
        <div className="hub-clientes__field hub-boarding-settings__narrow hub-boarding-stay__spaced">
          <label className="hub-clientes__label" htmlFor="bs-rec-cap">
            Pets por grupo
          </label>
          <input
            id="bs-rec-cap"
            className="hub-clientes__input"
            inputMode="numeric"
            value={draft.recreation_capacity}
            placeholder="Sem limite"
            onChange={(e) => update({ recreation_capacity: e.target.value.replace(/\D/g, '') })}
          />
        </div>
      </section>

      <div className="hub-boarding-stay__savebar hub-boarding-settings__savebar">
        <span className="hub-grooming-drawer__muted">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={!dirty || saving}
          onClick={() => void saveSettings()}
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>

      <section className="hub-boarding-settings__section">
        <div className="hub-grooming-drawer__heading-row">
          <h3 className="hub-grooming-drawer__heading">Acomodações</h3>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() =>
              setSpaceDraft({ id: null, name: '', kind: 'kennel', mode: 'hotel', capacity: '1', notes: '', active: true })
            }
          >
            Nova acomodação
          </button>
        </div>
        <p className="hub-grooming-drawer__hint">Baias, suítes e salas. A ocupação aparece no painel e no check-in.</p>
        {spaces.length ? (
          <ul className="hub-grooming-drawer__lines">
            {spaces.map((s) => (
              <li key={s.id} className={`hub-grooming-drawer__line${s.active ? '' : ' hub-grooming-drawer__line--done'}`}>
                <button
                  type="button"
                  className="hub-boarding-settings__space"
                  onClick={() =>
                    setSpaceDraft({
                      id: s.id,
                      name: s.name,
                      kind: s.kind,
                      mode: s.mode,
                      capacity: String(s.capacity),
                      notes: s.notes ?? '',
                      active: s.active,
                    })
                  }
                >
                  <span className="hub-grooming-drawer__line-name">{s.name}</span>
                  <span className="hub-grooming-drawer__muted">
                    {SPACE_KIND_LABELS[s.kind]} · {SPACE_MODE_LABELS[s.mode]} · {s.capacity}{' '}
                    {s.capacity === 1 ? 'pet' : 'pets'}
                    {s.active ? '' : ' · Inativa'}
                  </span>
                </button>
                {s.current != null && s.active ? (
                  <span className="hub-grooming-drawer__line-state">
                    {s.current}/{s.capacity} agora
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__muted">Nenhuma acomodação cadastrada.</p>
        )}
      </section>

      <HubSidePanel
        open={!!spaceDraft}
        onClose={() => setSpaceDraft(null)}
        title={spaceDraft?.id ? 'Editar acomodação' : 'Nova acomodação'}
        footer={
          <div className="hub-clientes__panel-footer">
            {spaceDraft?.id ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                disabled={spaceBusy}
                onClick={() => {
                  const s = spaces.find((x) => x.id === spaceDraft.id);
                  if (s) removeSpace(s);
                }}
              >
                Remover
              </button>
            ) : (
              <HubCancelButton onClick={() => setSpaceDraft(null)} />
            )}
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={spaceBusy}
              onClick={() => void saveSpace()}
            >
              {spaceBusy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {spaceDraft ? (
          <div className="hub-grooming-drawer">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="bs-space-name">
                Nome
              </label>
              <input
                id="bs-space-name"
                className="hub-clientes__input"
                value={spaceDraft.name}
                placeholder="Ex.: Baia 3"
                onChange={(e) => setSpaceDraft({ ...spaceDraft, name: e.target.value })}
              />
            </div>
            <div className="hub-boarding-care__grid">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="bs-space-kind">
                  Tipo
                </label>
                <HubSearchableCombobox
                  id="bs-space-kind"
                  options={(Object.keys(SPACE_KIND_LABELS) as BoardingSpaceKind[]).map((k) => ({
                    value: k,
                    label: SPACE_KIND_LABELS[k],
                  }))}
                  value={spaceDraft.kind}
                  placeholder="Tipo"
                  clearable={false}
                  onChange={(val) =>
                    setSpaceDraft({ ...spaceDraft, kind: (val || 'kennel') as BoardingSpaceKind })
                  }
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="bs-space-mode">
                  Uso
                </label>
                <HubSearchableCombobox
                  id="bs-space-mode"
                  options={(Object.keys(SPACE_MODE_LABELS) as BoardingSpaceMode[]).map((k) => ({
                    value: k,
                    label: SPACE_MODE_LABELS[k],
                  }))}
                  value={spaceDraft.mode}
                  placeholder="Uso"
                  clearable={false}
                  onChange={(val) =>
                    setSpaceDraft({ ...spaceDraft, mode: (val || 'hotel') as BoardingSpaceMode })
                  }
                />
              </div>
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="bs-space-cap">
                Capacidade (pets)
              </label>
              <input
                id="bs-space-cap"
                className="hub-clientes__input"
                inputMode="numeric"
                value={spaceDraft.capacity}
                onChange={(e) => setSpaceDraft({ ...spaceDraft, capacity: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="bs-space-notes">
                Observações
              </label>
              <textarea
                id="bs-space-notes"
                className="hub-clientes__input"
                rows={2}
                value={spaceDraft.notes}
                placeholder="Ex.: perto da janela, ideal para pets idosos"
                onChange={(e) => setSpaceDraft({ ...spaceDraft, notes: e.target.value })}
              />
            </div>
            {spaceDraft.id ? (
              <HubCheckbox checked={spaceDraft.active} onChange={(v) => setSpaceDraft({ ...spaceDraft, active: v })}>
                Disponível para novas estadias
              </HubCheckbox>
            ) : null}
          </div>
        ) : null}
      </HubSidePanel>
    </div>
  );
};

export default HubBoardingSettingsPage;
