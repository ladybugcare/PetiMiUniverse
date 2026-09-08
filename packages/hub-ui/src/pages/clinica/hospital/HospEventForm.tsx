import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  type HubClinicalBillingMode,
  type HubHospitalizationEventKind,
  type HubPrescriptionLookupKind,
  type HubPrescriptionLookupOption,
} from '../../../api/hubClinicalApi';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import {
  HubClinicalServicePicker,
  type ClinicalServicePick,
} from '../../../components/clinical/HubClinicalServicePicker';
import { useAlert } from '../../../components/AlertProvider';
import { HubCwsChoiceChips } from '../HubCwsChoiceChips';
import { HubAnamnesisChipPicker } from '../HubAnamnesisChipPicker';
import {
  DIET_TYPE_OPTIONS,
  PAIN_LEVEL_OPTIONS,
  dietTypeLabel,
  type AnamnesisChip,
} from '../anamnesisOptions';
import {
  CRT_OPTIONS,
  GENERAL_STATE_OPTIONS,
  HYDRATION_OPTIONS,
  LYMPH_OPTIONS,
  MUCOSA_OPTIONS,
  type VitalField,
  vitalReferenceHint,
} from '../physicalExamOptions';
import { EVENT_KIND_LABEL, EVENT_KIND_ORDER, hospEventHasContent } from './hospDisplay';

type HospEventFormProps = {
  clinicId: string;
  species?: string | null;
  canCreateLookups?: boolean;
  submitting?: boolean;
  /** Padrão da internação: medicações inclusas na diária. */
  defaultIncludesMedication?: boolean;
  onSubmit: (
    kind: HubHospitalizationEventKind,
    payload: Record<string, unknown>,
    billing?: {
      billing_mode: HubClinicalBillingMode;
      servicePick: ClinicalServicePick;
    },
  ) => Promise<void> | void;
};

const EMPTY: Record<string, string> = {};

const VITALS: Array<{ field: VitalField | 'spo2' | 'blood_pressure'; label: string; inputMode: 'decimal' | 'numeric'; placeholder: string }> = [
  { field: 'temperature_c', label: 'Temperatura (°C)', inputMode: 'decimal', placeholder: '38,5' },
  { field: 'heart_rate', label: 'FC (bpm)', inputMode: 'numeric', placeholder: '90' },
  { field: 'respiratory_rate', label: 'FR (rpm)', inputMode: 'numeric', placeholder: '20' },
  { field: 'weight_kg', label: 'Peso (kg)', inputMode: 'decimal', placeholder: '12,4' },
  { field: 'spo2', label: 'SpO₂ (%)', inputMode: 'numeric', placeholder: '98' },
  { field: 'blood_pressure', label: 'Pressão', inputMode: 'numeric', placeholder: '120/80' },
];

const ROUTE_OPTIONS: AnamnesisChip[] = [
  { key: 'IM', label: 'IM', level: 'info' },
  { key: 'IV', label: 'IV', level: 'info' },
  { key: 'SC', label: 'SC', level: 'info' },
  { key: 'Oral', label: 'Oral' },
  { key: 'Tópico', label: 'Tópico' },
];

const ACCEPT_OPTIONS: AnamnesisChip[] = [
  { key: 'yes', label: 'Aceitou', level: 'info' },
  { key: 'partial', label: 'Parcial', level: 'warning' },
  { key: 'no', label: 'Recusou', level: 'danger' },
];

const FLUID_OPTIONS: AnamnesisChip[] = [
  { key: 'nacl_09', label: 'NaCl 0,9%' },
  { key: 'ringer_lactato', label: 'Ringer lactato' },
  { key: 'ringer', label: 'Ringer simples' },
  { key: 'glicose_5', label: 'Glicose 5%' },
  { key: 'coloide', label: 'Colóide' },
];

const NURSING_OPTIONS: AnamnesisChip[] = [
  { key: 'curativo', label: 'Curativo' },
  { key: 'sonda', label: 'Sonda' },
  { key: 'fisioterapia', label: 'Fisioterapia' },
  { key: 'higiene', label: 'Higiene' },
  { key: 'monitoramento', label: 'Monitoramento' },
  { key: 'troca_via', label: 'Troca de via' },
  { key: 'posicionamento', label: 'Posicionamento' },
];

function compact(fields: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

function toComboboxOptions(rows: HubPrescriptionLookupOption[], current: string): HubComboboxOption[] {
  const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const opts: HubComboboxOption[] = sorted.map((r) => ({ value: r.label, label: r.label }));
  const cur = current.trim();
  if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
    opts.push({ value: current, label: `${cur} (valor atual)` });
  }
  return opts;
}

const HospEventForm: React.FC<HospEventFormProps> = ({
  clinicId,
  species,
  canCreateLookups = false,
  submitting = false,
  defaultIncludesMedication = false,
  onSubmit,
}) => {
  const { showError, showSuccess } = useAlert();
  const [kind, setKind] = useState<HubHospitalizationEventKind>('vital');
  const [fields, setFields] = useState<Record<string, string>>(EMPTY);
  const [foodTypes, setFoodTypes] = useState<string[]>([]);
  const [procedures, setProcedures] = useState<string[]>([]);
  const [medicationLookups, setMedicationLookups] = useState<HubPrescriptionLookupOption[]>([]);
  const [presentationLookups, setPresentationLookups] = useState<HubPrescriptionLookupOption[]>([]);
  const [billingMode, setBillingMode] = useState<HubClinicalBillingMode>(
    defaultIncludesMedication ? 'included' : 'charge',
  );
  const [servicePick, setServicePick] = useState<ClinicalServicePick>({
    hub_service_type_id: '',
    unit_amount: '',
  });

  const setField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const reset = () => {
    setFields(EMPTY);
    setFoodTypes([]);
    setProcedures([]);
    setBillingMode(defaultIncludesMedication ? 'included' : 'charge');
    setServicePick({ hub_service_type_id: '', unit_amount: '' });
  };

  const payload = useMemo(() => {
    const next = compact(fields);
    if (kind === 'feeding' && foodTypes.length) {
      next.food_types = foodTypes;
      next.food_type = foodTypes.map((k) => dietTypeLabel(k)).join(', ');
    }
    if (kind === 'nursing' && procedures.length) {
      next.procedures = procedures;
      next.procedure = procedures
        .map((k) => NURSING_OPTIONS.find((o) => o.key === k)?.label ?? k)
        .join(', ');
    }
    return next;
  }, [fields, foodTypes, procedures, kind]);

  const canSubmit = !submitting && hospEventHasContent(payload);

  const handleKind = (next: HubHospitalizationEventKind) => {
    setKind(next);
    reset();
  };

  const loadKind = useCallback(
    async (lookupKind: HubPrescriptionLookupKind) => {
      if (!clinicId) return;
      try {
        const res = await hubClinicalApi.listPrescriptionLookups(clinicId, lookupKind);
        const rows = res.lookups ?? [];
        if (lookupKind === 'medication') setMedicationLookups(rows);
        if (lookupKind === 'presentation') setPresentationLookups(rows);
      } catch {
        if (lookupKind === 'medication') setMedicationLookups([]);
        if (lookupKind === 'presentation') setPresentationLookups([]);
      }
    },
    [clinicId],
  );

  useEffect(() => {
    if (kind !== 'medication') return;
    void loadKind('medication');
    void loadKind('presentation');
  }, [kind, loadKind]);

  const medicationOptions = useMemo(
    () => toComboboxOptions(medicationLookups, fields.medication_name ?? ''),
    [medicationLookups, fields.medication_name],
  );
  const presentationOptions = useMemo(
    () => toComboboxOptions(presentationLookups, fields.presentation ?? ''),
    [presentationLookups, fields.presentation],
  );

  const handleLookupChange = async (
    lookupKind: Extract<HubPrescriptionLookupKind, 'medication' | 'presentation'>,
    field: 'medication_name' | 'presentation',
    raw: string,
  ) => {
    const t = raw.trim();
    if (!t) {
      setField(field, '');
      return;
    }
    const existing = lookupKind === 'medication' ? medicationLookups : presentationLookups;
    const match = existing.find((o) => o.label.trim().toLowerCase() === t.toLowerCase());
    if (match) {
      setField(field, match.label);
      if (!match.from_catalog && canCreateLookups) {
        void hubClinicalApi
          .createPrescriptionLookup({ clinic_id: clinicId, kind: lookupKind, label: match.label })
          .then(() => loadKind(lookupKind))
          .catch(() => undefined);
      }
      return;
    }
    if (!canCreateLookups) {
      setField(field, t);
      return;
    }
    try {
      const res = await hubClinicalApi.createPrescriptionLookup({
        clinic_id: clinicId,
        kind: lookupKind,
        label: t,
      });
      await loadKind(lookupKind);
      setField(field, res.lookup.label);
      if (res.created) {
        showSuccess(lookupKind === 'medication' ? 'Medicamento adicionado ao catálogo' : 'Apresentação adicionada ao catálogo');
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao adicionar ao catálogo');
      setField(field, t);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const nextPayload = { ...payload };
    if (kind === 'note') {
      const text = String(nextPayload.text ?? nextPayload.notes ?? '').trim();
      delete nextPayload.notes;
      if (text) nextPayload.text = text;
    }
    if (kind === 'medication') {
      nextPayload.billing_mode = billingMode;
      if (servicePick.hub_service_type_id) {
        nextPayload.hub_service_type_id = servicePick.hub_service_type_id;
        nextPayload.unit_amount = servicePick.unit_amount
          ? Number(servicePick.unit_amount.replace(',', '.'))
          : undefined;
      }
      await onSubmit(kind, nextPayload, { billing_mode: billingMode, servicePick });
    } else {
      await onSubmit(kind, nextPayload);
    }
    reset();
  };

  return (
    <div className="hub-cws-exam-form hub-hosp-event-form">
      <div className="hub-cws-tabs" role="tablist" aria-label="Tipo de evento">
        {EVENT_KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`hub-cws-tab${kind === k ? ' hub-cws-tab--on' : ''}`}
            onClick={() => handleKind(k)}
          >
            {EVENT_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === 'vital' ? (
        <>
          <div className="hub-cws-vitals hub-cws-vitals--exam">
            {VITALS.map(({ field, label, inputMode, placeholder }) => (
              <div key={field} className="hub-cws-vital-cell">
                <label htmlFor={`hosp_${field}`}>{label}</label>
                <input
                  id={`hosp_${field}`}
                  type="text"
                  inputMode={inputMode}
                  value={fields[field] ?? ''}
                  placeholder={placeholder}
                  onChange={(e) => setField(field, e.target.value)}
                />
                {field === 'temperature_c' || field === 'heart_rate' || field === 'respiratory_rate' || field === 'weight_kg' ? (
                  <p className="hub-cws-vital-hint">{vitalReferenceHint(field, species)}</p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">TPC</div>
            <HubCwsChoiceChips
              options={CRT_OPTIONS}
              value={fields.crt}
              ariaLabel="Tempo de preenchimento capilar"
              onChange={(next) => setField('crt', next)}
            />
          </div>
          <div className="hub-cws-exam-assess">
            <div className="hub-cws-an-block hub-cws-an-block--tight">
              <div className="hub-cws-an-block__title">Hidratação</div>
              <HubCwsChoiceChips
                options={HYDRATION_OPTIONS}
                value={fields.hydration}
                ariaLabel="Hidratação"
                onChange={(next) => setField('hydration', next)}
              />
            </div>
            <div className="hub-cws-an-block hub-cws-an-block--tight">
              <div className="hub-cws-an-block__title">Mucosas</div>
              <HubCwsChoiceChips
                options={MUCOSA_OPTIONS}
                value={fields.mucosa}
                ariaLabel="Mucosas"
                onChange={(next) => setField('mucosa', next)}
              />
            </div>
            <div className="hub-cws-an-block hub-cws-an-block--tight">
              <div className="hub-cws-an-block__title">Linfonodos</div>
              <HubCwsChoiceChips
                options={LYMPH_OPTIONS}
                value={fields.lymph_nodes}
                ariaLabel="Linfonodos"
                onChange={(next) => setField('lymph_nodes', next)}
              />
            </div>
            <div className="hub-cws-an-block hub-cws-an-block--tight">
              <div className="hub-cws-an-block__title">Estado geral</div>
              <HubCwsChoiceChips
                options={GENERAL_STATE_OPTIONS}
                value={fields.general_state}
                ariaLabel="Estado geral"
                onChange={(next) => setField('general_state', next)}
              />
            </div>
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Dor</div>
            <HubCwsChoiceChips
              options={PAIN_LEVEL_OPTIONS}
              value={fields.pain}
              ariaLabel="Dor"
              onChange={(next) => setField('pain', next)}
            />
          </div>
        </>
      ) : null}

      {kind === 'medication' ? (
        <>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="hosp-rx-medication">Medicamento</label>
            <HubSearchableCombobox
              id="hosp-rx-medication"
              options={medicationOptions}
              value={fields.medication_name ?? ''}
              onChange={(v) => void handleLookupChange('medication', 'medication_name', v)}
              placeholder="Buscar no catálogo, ou criar outro…"
              searchPlaceholder="Buscar medicamento…"
              allowCreate={canCreateLookups}
              createEntityLabel="medicamento"
              createEntityGender="m"
              ariaLabel="Medicamento"
              clearable
            />
          </div>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="hosp-rx-presentation">Apresentação</label>
            <HubSearchableCombobox
              id="hosp-rx-presentation"
              options={presentationOptions}
              value={fields.presentation ?? ''}
              onChange={(v) => void handleLookupChange('presentation', 'presentation', v)}
              placeholder="Selecionar…"
              searchPlaceholder="Buscar apresentação…"
              allowCreate={canCreateLookups}
              createEntityLabel="apresentação"
              createEntityGender="f"
              ariaLabel="Apresentação"
              clearable
            />
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Via</div>
            <HubCwsChoiceChips
              options={ROUTE_OPTIONS}
              value={fields.route}
              ariaLabel="Via"
              onChange={(next) => setField('route', next)}
            />
          </div>
          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="hosp-rx-dose">Dose</label>
              <input
                id="hosp-rx-dose"
                className="hub-clientes__input"
                value={fields.dosage ?? ''}
                onChange={(e) => setField('dosage', e.target.value)}
                placeholder="Ex.: 0,5 ml"
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="hosp-rx-route">Via</label>
              <input
                id="hosp-rx-route"
                className="hub-clientes__input"
                value={fields.route ?? ''}
                onChange={(e) => setField('route', e.target.value)}
                placeholder="Opcional — ou use os chips"
              />
            </div>
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Cobrança</div>
            <HubCwsChoiceChips
              options={[
                { key: 'charge', label: 'Cobrar à parte', level: 'info' },
                { key: 'included', label: 'Incluso na diária' },
              ]}
              value={billingMode}
              ariaLabel="Modo de cobrança da medicação"
              onChange={(next) => setBillingMode(next === 'included' ? 'included' : 'charge')}
            />
          </div>
          {billingMode === 'charge' ? (
            <HubClinicalServicePicker
              clinicId={clinicId}
              group="internacao"
              value={servicePick}
              onChange={setServicePick}
              label="Serviço cobrável (opcional)"
              placeholder="Buscar serviço de medicação…"
              disabled={submitting}
              allowPriceOverride
              id="hosp-rx-service"
            />
          ) : null}
        </>
      ) : null}

      {kind === 'feeding' ? (
        <>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Alimento</div>
            <HubAnamnesisChipPicker
              options={DIET_TYPE_OPTIONS}
              value={foodTypes}
              onChange={setFoodTypes}
              customPlaceholder="Outro alimento…"
              labelFor={dietTypeLabel}
            />
          </div>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Aceitação</div>
            <HubCwsChoiceChips
              options={ACCEPT_OPTIONS}
              value={fields.accepted}
              ariaLabel="Aceitação"
              onChange={(next) => setField('accepted', next)}
            />
          </div>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="hosp-feed-amount">Quantidade (g)</label>
            <input
              id="hosp-feed-amount"
              className="hub-clientes__input"
              inputMode="decimal"
              value={fields.amount_g ?? ''}
              onChange={(e) => setField('amount_g', e.target.value)}
              placeholder="Ex.: 80"
            />
          </div>
        </>
      ) : null}

      {kind === 'fluid' ? (
        <>
          <div className="hub-cws-an-block hub-cws-an-block--tight">
            <div className="hub-cws-an-block__title">Fluido</div>
            <HubCwsChoiceChips
              options={FLUID_OPTIONS}
              value={fields.fluid_type}
              ariaLabel="Fluido"
              onChange={(next) => setField('fluid_type', next)}
            />
          </div>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="hosp-fluid-custom">Outro fluido</label>
            <input
              id="hosp-fluid-custom"
              className="hub-clientes__input"
              value={FLUID_OPTIONS.some((o) => o.key === fields.fluid_type) ? '' : (fields.fluid_type ?? '')}
              onChange={(e) => setField('fluid_type', e.target.value)}
              placeholder="Nome do fluido, se não estiver nos chips"
            />
          </div>
          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="hosp-fluid-vol">Volume (ml)</label>
              <input
                id="hosp-fluid-vol"
                className="hub-clientes__input"
                inputMode="decimal"
                value={fields.volume_ml ?? ''}
                onChange={(e) => setField('volume_ml', e.target.value)}
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="hosp-fluid-rate">Taxa (ml/h)</label>
              <input
                id="hosp-fluid-rate"
                className="hub-clientes__input"
                inputMode="decimal"
                value={fields.rate_ml_h ?? ''}
                onChange={(e) => setField('rate_ml_h', e.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}

      {kind === 'nursing' ? (
        <div className="hub-cws-an-block hub-cws-an-block--tight">
          <div className="hub-cws-an-block__title">Procedimento</div>
          <HubAnamnesisChipPicker
            options={NURSING_OPTIONS}
            value={procedures}
            onChange={setProcedures}
            customPlaceholder="Outro procedimento…"
          />
        </div>
      ) : null}

      {kind === 'note' ? (
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="hosp-ev-title">Título</label>
          <input
            id="hosp-ev-title"
            className="hub-clientes__input"
            value={fields.title ?? ''}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="Ex.: Evolução da manhã"
          />
        </div>
      ) : null}

      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="hosp-ev-notes">{kind === 'note' ? 'Texto' : 'Observação (opcional)'}</label>
        <textarea
          id="hosp-ev-notes"
          className="hub-clientes__textarea hub-cws-textarea"
          rows={kind === 'note' ? 5 : 2}
          value={fields.notes ?? ''}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder={kind === 'note' ? 'Evolução, intercorrência ou orientação…' : 'Detalhe extra, se precisar'}
        />
      </div>

      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary"
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Registrando…' : 'Registrar evento'}
      </button>
    </div>
  );
};

export default HospEventForm;
