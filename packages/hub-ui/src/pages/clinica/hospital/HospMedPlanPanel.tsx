import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Plus, X } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import {
  hubClinicalApi,
  type HubHospMedDose,
  type HubHospMedNotAdminReason,
  type HubHospMedOrderBundle,
  type HubHospMedVersionInput,
  type HubPrescriptionLookupOption,
} from '../../../api/hubClinicalApi';
import { HubSidePanel } from '../../../components/HubSidePanel';
import { HubBottomSheet } from '../../../components/HubBottomSheet';
import { HubCancelButton } from '../../../components/HubCancelButton';
import { HubTimeField } from '../../../components/HubTimeField';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { useAlert } from '../../../components/AlertProvider';
import { HubCwsChoiceChips } from '../HubCwsChoiceChips';
import { nowHm } from '../../../utils/hubTime';
import {
  DOSE_UI_LABEL,
  FREQ_PRESET_OPTIONS,
  NOT_ADMIN_REASON_OPTIONS,
  doseUiStatus,
  formatHmFromIso,
  formatScheduleSummary,
  intervalHoursFromPreset,
  newIdempotencyKey,
  normalizeStartHm,
  presetFromVersion,
  scheduleFromPreset,
  startsAtIsoFromHm,
  timesInDayFromStart,
  type FreqPreset,
} from './hospMedPlan';

type Props = {
  clinicId: string;
  hospitalizationId: string;
  isActive: boolean;
  defaultIncludesMedication?: boolean;
  canCreateLookups?: boolean;
};

type DraftForm = {
  medication_name: string;
  presentation: string;
  concentration: string;
  dose_value: string;
  dose_unit: string;
  route: string;
  preset: FreqPreset;
  /** Horário de início do ciclo (HH:mm) — base para 1x/dia e intervalos. */
  start_hm: string;
  times: string[];
  instructions: string;
  billing_mode: 'charge' | 'included';
  change_reason: string;
  ends_at_local: string;
};

const emptyDraft = (included: boolean): DraftForm => ({
  medication_name: '',
  presentation: '',
  concentration: '',
  dose_value: '',
  dose_unit: 'mg',
  route: '',
  preset: '8h',
  start_hm: nowHm() || '08:00',
  times: ['09:00'],
  instructions: '',
  billing_mode: included ? 'included' : 'charge',
  change_reason: '',
  ends_at_local: '',
});

function toComboboxOptions(rows: HubPrescriptionLookupOption[], current: string): HubComboboxOption[] {
  const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const opts: HubComboboxOption[] = sorted.map((r) => ({ value: r.label, label: r.label }));
  const cur = current.trim();
  if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
    opts.push({ value: current, label: `${cur} (valor atual)` });
  }
  return opts;
}

function draftToInput(draft: DraftForm, changeReason?: string | null): HubHospMedVersionInput | null {
  const dose_value = Number(String(draft.dose_value).replace(',', '.'));
  if (!draft.medication_name.trim() || !Number.isFinite(dose_value) || dose_value <= 0 || !draft.dose_unit.trim()) {
    return null;
  }
  const startHm = normalizeStartHm(draft.start_hm);
  if (draft.preset !== 'fixed' && !startHm) return null;
  const sched = scheduleFromPreset(draft.preset, draft.times, startHm);
  if (sched.schedule_kind === 'fixed_times' && sched.times.length === 0) return null;
  const starts_at =
    draft.preset === 'fixed'
      ? startsAtIsoFromHm(sched.times[0] ?? startHm)
      : startsAtIsoFromHm(startHm);
  let ends_at: string | null = null;
  if (draft.ends_at_local.trim()) {
    const d = new Date(draft.ends_at_local);
    if (!Number.isNaN(d.getTime())) ends_at = d.toISOString();
  }
  return {
    medication_name: draft.medication_name.trim(),
    presentation: draft.presentation.trim() || null,
    concentration: draft.concentration.trim() || null,
    dose_value,
    dose_unit: draft.dose_unit.trim(),
    route: draft.route.trim() || null,
    schedule_kind: sched.schedule_kind,
    times: sched.times,
    interval_hours: sched.interval_hours,
    starts_at,
    ends_at,
    instructions: draft.instructions.trim() || null,
    billing_mode: draft.billing_mode,
    change_reason: changeReason?.trim() || null,
  };
}

const HospMedPlanPanel: React.FC<Props> = ({
  clinicId,
  hospitalizationId,
  isActive,
  defaultIncludesMedication = false,
  canCreateLookups = false,
}) => {
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canManage =
    hasPermission('hub.clinic.med_orders.manage') || hasPermission('hub.clinic.write');
  const canAdmin =
    hasPermission('hub.clinic.med_admin.write') || hasPermission('hub.clinic.write');

  const [orders, setOrders] = useState<HubHospMedOrderBundle[]>([]);
  const [doses, setDoses] = useState<HubHospMedDose[]>([]);
  const [doseDate, setDoseDate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [orderPanel, setOrderPanel] = useState<'create' | 'edit' | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(() => emptyDraft(defaultIncludesMedication));
  const [savingOrder, setSavingOrder] = useState(false);

  const [adminDose, setAdminDose] = useState<HubHospMedDose | null>(null);
  const [adminMode, setAdminMode] = useState<'given' | 'not' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [adminReason, setAdminReason] = useState<HubHospMedNotAdminReason>('recusou');
  const [adminReasonNotes, setAdminReasonNotes] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  const [medLookups, setMedLookups] = useState<HubPrescriptionLookupOption[]>([]);
  const [timeDraft, setTimeDraft] = useState('');

  const reload = useCallback(async () => {
    if (!clinicId || !hospitalizationId) return;
    const [o, d] = await Promise.all([
      hubClinicalApi.listHospMedOrders(hospitalizationId, clinicId),
      hubClinicalApi.listHospMedDoses(hospitalizationId, clinicId),
    ]);
    setOrders(o.orders ?? []);
    setDoses(d.doses ?? []);
    setDoseDate(d.date);
  }, [clinicId, hospitalizationId]);

  useEffect(() => {
    setLoading(true);
    void reload()
      .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao carregar plano de medicação'))
      .finally(() => setLoading(false));
  }, [reload, showError]);

  useEffect(() => {
    if (!clinicId || orderPanel == null) return;
    void hubClinicalApi
      .listPrescriptionLookups(clinicId, 'medication')
      .then((r) => setMedLookups(r.lookups ?? []))
      .catch(() => setMedLookups([]));
  }, [clinicId, orderPanel]);

  const medOptions = useMemo(
    () => toComboboxOptions(medLookups, draft.medication_name),
    [medLookups, draft.medication_name],
  );

  const openCreate = () => {
    setEditingOrderId(null);
    setDraft(emptyDraft(defaultIncludesMedication));
    setOrderPanel('create');
  };

  const openEdit = (bundle: HubHospMedOrderBundle) => {
    const v = bundle.current_version;
    if (!v) return;
    setEditingOrderId(bundle.order.id);
    const preset = presetFromVersion(v);
    const startFromVersion = v.starts_at ? formatHmFromIso(v.starts_at) : '';
    setDraft({
      medication_name: v.medication_name,
      presentation: v.presentation ?? '',
      concentration: v.concentration ?? '',
      dose_value: String(v.dose_value),
      dose_unit: v.dose_unit,
      route: v.route ?? '',
      preset,
      start_hm: normalizeStartHm(
        startFromVersion || (v.times?.[0] ?? ''),
        nowHm() || '08:00',
      ),
      times: v.times?.length ? [...v.times] : ['09:00'],
      instructions: v.instructions ?? '',
      billing_mode: v.billing_mode === 'charge' ? 'charge' : 'included',
      change_reason: '',
      ends_at_local: '',
    });
    setOrderPanel('edit');
  };

  const saveOrder = async () => {
    const input = draftToInput(draft, orderPanel === 'edit' ? draft.change_reason : null);
    if (!input) {
      showError('Preencha medicamento, dose e unidade');
      return;
    }
    if (orderPanel === 'edit' && !draft.change_reason.trim()) {
      showError('Informe o motivo da alteração');
      return;
    }
    setSavingOrder(true);
    try {
      if (orderPanel === 'create') {
        await hubClinicalApi.createHospMedOrder(hospitalizationId, { clinic_id: clinicId, ...input });
        showSuccess('Prescrição adicionada');
      } else if (editingOrderId) {
        await hubClinicalApi.createHospMedOrderVersion(hospitalizationId, editingOrderId, {
          clinic_id: clinicId,
          ...input,
          change_reason: draft.change_reason.trim(),
        });
        showSuccess('Prescrição atualizada');
      }
      setOrderPanel(null);
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar prescrição');
    } finally {
      setSavingOrder(false);
    }
  };

  const suspendOrder = async (orderId: string) => {
    try {
      await hubClinicalApi.suspendHospMedOrder(hospitalizationId, orderId, clinicId);
      showSuccess('Prescrição suspensa');
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao suspender');
    }
  };

  const resumeOrder = async (orderId: string) => {
    try {
      await hubClinicalApi.resumeHospMedOrder(hospitalizationId, orderId, clinicId);
      showSuccess('Prescrição reativada');
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao reativar');
    }
  };

  const submitAdmin = async () => {
    if (!adminDose || !adminMode) return;
    setAdminSubmitting(true);
    try {
      await hubClinicalApi.completeHospMedDose(hospitalizationId, adminDose.id, {
        clinic_id: clinicId,
        outcome: adminMode === 'given' ? 'administered' : 'not_administered',
        notes: adminNotes.trim() || null,
        reason_code: adminMode === 'not' ? adminReason : null,
        reason_notes: adminMode === 'not' ? adminReasonNotes.trim() || null : null,
        idempotency_key: newIdempotencyKey(),
      });
      showSuccess(adminMode === 'given' ? 'Dose administrada' : 'Não administração registrada');
      setAdminDose(null);
      setAdminMode(null);
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar');
    } finally {
      setAdminSubmitting(false);
    }
  };

  const addTime = () => {
    if (!timeDraft) return;
    setDraft((d) => ({
      ...d,
      times: [...new Set([...d.times, timeDraft])].sort(),
    }));
    setTimeDraft('');
  };

  const printHref = `/hub/impressoes/internacoes/${hospitalizationId}/plano-medicacao${
    doseDate ? `?date=${encodeURIComponent(doseDate)}` : ''
  }`;

  return (
    <>
      <section className="hub-hosp-detail__block">
        <div className="hub-hosp-detail__block-head">
          <div>
            <h2 className="hub-hosp-detail__block-title">Prescrição ativa</h2>
            <p className="hub-hosp-detail__block-lead">
              Plano a seguir nesta internação (não é a receita para o tutor).
            </p>
          </div>
          <div className="hub-hosp-detail__actions">
            <Link to={printHref} className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
              <Printer size={14} aria-hidden /> Imprimir folha do leito
            </Link>
            {canManage && isActive ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={openCreate}
              >
                <Plus size={14} aria-hidden /> Adicionar
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : orders.length === 0 ? (
          <p className="hub-clientes__muted">Nenhuma medicação prescrita ainda.</p>
        ) : (
          <ul className="hub-hosp-med-orders">
            {orders.map((b) => {
              const v = b.current_version;
              if (!v) return null;
              return (
                <li key={b.order.id} className={`hub-hosp-med-order hub-hosp-med-order--${b.order.status}`}>
                  <div className="hub-hosp-med-order__main">
                    <strong>{v.medication_name}</strong>
                    <span>
                      {v.dose_label ?? `${v.dose_value} ${v.dose_unit}`}
                      {v.route ? ` · ${v.route}` : ''}
                      {' · '}
                      {formatScheduleSummary(v)}
                      {' · v'}
                      {v.version_no}
                    </span>
                    <span className="hub-clientes__muted">
                      {b.order.status === 'suspended'
                        ? 'Suspensa'
                        : b.order.status === 'active'
                          ? 'Ativa'
                          : b.order.status}
                      {v.prescribed_by?.full_name ? ` · ${v.prescribed_by.full_name}` : ''}
                    </span>
                  </div>
                  {canManage && isActive && (b.order.status === 'active' || b.order.status === 'suspended') ? (
                    <div className="hub-hosp-med-order__actions">
                      {b.order.status === 'active' ? (
                        <>
                          <button type="button" className="hub-clientes__link-btn" onClick={() => openEdit(b)}>
                            Alterar
                          </button>
                          <button
                            type="button"
                            className="hub-clientes__link-btn"
                            onClick={() => void suspendOrder(b.order.id)}
                          >
                            Suspender
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="hub-clientes__link-btn"
                          onClick={() => void resumeOrder(b.order.id)}
                        >
                          Reativar
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="hub-hosp-detail__block">
        <h2 className="hub-hosp-detail__block-title">Administração de hoje</h2>
        <p className="hub-hosp-detail__block-lead">
          Checklist do dia{doseDate ? ` (${doseDate.split('-').reverse().join('/')})` : ''}. Atrasado é só
          destaque — o resultado não muda sozinho.
        </p>
        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : doses.length === 0 ? (
          <p className="hub-clientes__muted">Nenhuma dose para hoje.</p>
        ) : (
          <ul className="hub-hosp-med-doses">
            {doses.map((dose) => {
              const ui = doseUiStatus(dose);
              const name = dose.version?.medication_name ?? 'Medicamento';
              return (
                <li key={dose.id} className={`hub-hosp-med-dose hub-hosp-med-dose--${ui}`}>
                  <div className="hub-hosp-med-dose__time">{formatHmFromIso(dose.scheduled_for)}</div>
                  <div className="hub-hosp-med-dose__body">
                    <strong>
                      {name}
                      {dose.dose_label ? ` · ${dose.dose_label}` : ''}
                      {dose.version?.route ? ` · ${dose.version.route}` : ''}
                    </strong>
                    <span className={`hub-hosp-med-dose__status hub-hosp-med-dose__status--${ui}`}>
                      {DOSE_UI_LABEL[ui]}
                    </span>
                  </div>
                  {canAdmin && isActive && dose.status === 'pending' ? (
                    <div className="hub-hosp-med-dose__actions">
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        onClick={() => {
                          setAdminDose(dose);
                          setAdminMode('given');
                          setAdminNotes('');
                        }}
                      >
                        Administrar
                      </button>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => {
                          setAdminDose(dose);
                          setAdminMode('not');
                          setAdminNotes('');
                          setAdminReason('recusou');
                          setAdminReasonNotes('');
                        }}
                      >
                        Não administrar
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <HubSidePanel
        open={orderPanel != null}
        onClose={() => setOrderPanel(null)}
        title={orderPanel === 'edit' ? 'Alterar prescrição' : 'Nova prescrição'}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setOrderPanel(null)} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={savingOrder}
              onClick={() => void saveOrder()}
            >
              {savingOrder ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <div className="hub-clinic-field">
            <label htmlFor="hosp-med-name">Medicamento</label>
            <HubSearchableCombobox
              id="hosp-med-name"
              options={medOptions}
              value={draft.medication_name}
              onChange={(v) => setDraft((d) => ({ ...d, medication_name: v }))}
              placeholder="Buscar ou digitar…"
              allowCreate={canCreateLookups}
              createEntityLabel="medicamento"
              createEntityGender="m"
              ariaLabel="Medicamento"
              clearable
            />
          </div>
          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-dose">Dose</label>
              <input
                id="hosp-med-dose"
                className="hub-clientes__input"
                inputMode="decimal"
                value={draft.dose_value}
                onChange={(e) => setDraft((d) => ({ ...d, dose_value: e.target.value }))}
                placeholder="10"
              />
            </div>
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-unit">Unidade</label>
              <input
                id="hosp-med-unit"
                className="hub-clientes__input"
                value={draft.dose_unit}
                onChange={(e) => setDraft((d) => ({ ...d, dose_unit: e.target.value }))}
                placeholder="mg"
              />
            </div>
          </div>
          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-pres">Apresentação</label>
              <input
                id="hosp-med-pres"
                className="hub-clientes__input"
                value={draft.presentation}
                onChange={(e) => setDraft((d) => ({ ...d, presentation: e.target.value }))}
              />
            </div>
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-conc">Concentração</label>
              <input
                id="hosp-med-conc"
                className="hub-clientes__input"
                value={draft.concentration}
                onChange={(e) => setDraft((d) => ({ ...d, concentration: e.target.value }))}
              />
            </div>
          </div>
          <div className="hub-clinic-field">
            <label htmlFor="hosp-med-route">Via</label>
            <input
              id="hosp-med-route"
              className="hub-clientes__input"
              value={draft.route}
              onChange={(e) => setDraft((d) => ({ ...d, route: e.target.value }))}
              placeholder="IV, IM, SC, Oral…"
            />
          </div>
          <div className="hub-hosp-med-freq">
            <div className="hub-cws-an-block hub-cws-an-block--tight">
              <div className="hub-cws-an-block__title">Frequência</div>
              <HubCwsChoiceChips
                options={FREQ_PRESET_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
                value={draft.preset}
                ariaLabel="Frequência"
                onChange={(next) => {
                  if (!next) return;
                  setDraft((d) => ({ ...d, preset: next as FreqPreset }));
                }}
              />
            </div>

            {draft.preset !== 'fixed' ? (
              <div className="hub-hosp-med-freq__schedule">
                <div className="hub-hosp-med-freq__start">
                  <HubTimeField
                    id="hosp-med-start"
                    label="Início"
                    valueHm={draft.start_hm}
                    onChangeHm={(hm) => setDraft((d) => ({ ...d, start_hm: hm }))}
                    minuteStep={5}
                  />
                </div>
                {intervalHoursFromPreset(draft.preset) != null ? (
                  <div className="hub-hosp-med-freq__preview">
                    <span className="hub-clientes__label">No dia</span>
                    <div className="hub-hosp-med-times" aria-label="Horários calculados">
                      {timesInDayFromStart(draft.start_hm, intervalHoursFromPreset(draft.preset)!).map((t) => (
                        <span key={t} className="hub-hosp-med-time-chip hub-hosp-med-time-chip--calc">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="hub-clientes__muted hub-hosp-med-freq__hint">
                      Calculado a partir do início, a cada {intervalHoursFromPreset(draft.preset)}h.
                    </p>
                  </div>
                ) : (
                  <p className="hub-clientes__muted hub-hosp-med-freq__hint hub-hosp-med-freq__hint--alone">
                    Horário da dose diária.
                  </p>
                )}
              </div>
            ) : (
              <div className="hub-hosp-med-freq__fixed">
                <span className="hub-clientes__label">Horários</span>
                {draft.times.length > 0 ? (
                  <div className="hub-hosp-med-times">
                    {draft.times.map((t) => (
                      <span key={t} className="hub-hosp-med-time-chip">
                        {t}
                        <button
                          type="button"
                          className="hub-hosp-med-time-chip__x"
                          aria-label={`Remover ${t}`}
                          onClick={() => setDraft((d) => ({ ...d, times: d.times.filter((x) => x !== t) }))}
                        >
                          <X size={12} aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="hub-hosp-med-times-add">
                  <div className="hub-hosp-med-freq__start">
                    <HubTimeField id="hosp-med-time" valueHm={timeDraft} onChangeHm={setTimeDraft} minuteStep={5} />
                  </div>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    onClick={addTime}
                    disabled={!timeDraft}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Cobrança</div>
            <HubCwsChoiceChips
              options={[
                { key: 'included', label: 'Incluso na diária' },
                { key: 'charge', label: 'Cobrar à parte', level: 'info' },
              ]}
              value={draft.billing_mode}
              ariaLabel="Cobrança"
              onChange={(next) => {
                if (next !== 'charge' && next !== 'included') return;
                setDraft((d) => ({ ...d, billing_mode: next }));
              }}
            />
          </div>
          <div className="hub-clinic-field">
            <label htmlFor="hosp-med-instr">Instruções</label>
            <textarea
              id="hosp-med-instr"
              className="hub-clientes__textarea"
              rows={2}
              value={draft.instructions}
              onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
            />
          </div>
          {orderPanel === 'edit' ? (
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-reason">Motivo da alteração</label>
              <input
                id="hosp-med-reason"
                className="hub-clientes__input"
                value={draft.change_reason}
                onChange={(e) => setDraft((d) => ({ ...d, change_reason: e.target.value }))}
                placeholder="Obrigatório"
              />
            </div>
          ) : null}
        </div>
      </HubSidePanel>

      <HubBottomSheet
        open={adminDose != null && adminMode != null}
        onClose={() => {
          setAdminDose(null);
          setAdminMode(null);
        }}
        title={adminMode === 'given' ? 'Administrar dose' : 'Não administrar'}
        summary={
          adminDose ? (
            <>
              <strong>{formatHmFromIso(adminDose.scheduled_for)}</strong>
              {' · '}
              {adminDose.version?.medication_name ?? 'Medicamento'}
              {adminDose.dose_label ? ` · ${adminDose.dose_label}` : ''}
            </>
          ) : null
        }
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton
              onClick={() => {
                setAdminDose(null);
                setAdminMode(null);
              }}
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={adminSubmitting}
              onClick={() => void submitAdmin()}
            >
              {adminSubmitting ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        }
      >
        {adminDose ? (
          <div className="hub-clientes__form-stack">
            {adminMode === 'not' ? (
              <>
                <div className="hub-cws-an-block hub-cws-an-block--tight">
                  <div className="hub-cws-an-block__title">Motivo</div>
                  <HubCwsChoiceChips
                    options={NOT_ADMIN_REASON_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
                    value={adminReason}
                    ariaLabel="Motivo"
                    onChange={(next) => {
                      if (!next) return;
                      setAdminReason(next as HubHospMedNotAdminReason);
                    }}
                  />
                </div>
                {adminReason === 'outro' ? (
                  <div className="hub-clinic-field">
                    <label htmlFor="hosp-med-na-notes">Descreva o motivo</label>
                    <textarea
                      id="hosp-med-na-notes"
                      className="hub-clientes__textarea"
                      rows={2}
                      value={adminReasonNotes}
                      onChange={(e) => setAdminReasonNotes(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="hub-clinic-field">
              <label htmlFor="hosp-med-admin-notes">Observação (opcional)</label>
              <textarea
                id="hosp-med-admin-notes"
                className="hub-clientes__textarea"
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </HubBottomSheet>
    </>
  );
};

export default HospMedPlanPanel;
