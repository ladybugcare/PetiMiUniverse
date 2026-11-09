import React from 'react';
import { CalendarDays } from 'lucide-react';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubTimeField } from '../../components/HubTimeField';
import type { BlockPickupState, BlockRecurrenceState } from './appointmentSchedulingUtils';

const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const RECURRENCE_LABELS: Record<BlockRecurrenceState['kind'], string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

export type BlockRecurrencePickupFieldsProps = {
  blockKey: string;
  recurrence: BlockRecurrenceState;
  pickup: BlockPickupState;
  hideRecurrence?: boolean;
  hidePickup?: boolean;
  /** Texto sob o L&T (ex.: criado em cada ocorrência). */
  pickupHint?: string | null;
  ltServiceOptions: HubComboboxOption[];
  onRecurrenceChange: (next: BlockRecurrenceState) => void;
  onPickupChange: (next: BlockPickupState) => void;
};

export const BlockRecurrencePickupFields: React.FC<BlockRecurrencePickupFieldsProps> = ({
  blockKey,
  recurrence,
  pickup,
  hideRecurrence = false,
  hidePickup = false,
  pickupHint = null,
  ltServiceOptions,
  onRecurrenceChange,
  onPickupChange,
}) => {
  return (
    <>
      {!hideRecurrence ? (
        <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 8 }}>
          <HubCheckbox
            className="nam-checkbox-label"
            checked={recurrence.enabled}
            onChange={(enabled) => onRecurrenceChange({ ...recurrence, enabled })}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={15} aria-hidden />
              Repetir este bloco
            </span>
          </HubCheckbox>
          {recurrence.enabled ? (
            <div className="nam-recurrence" style={{ marginTop: 8 }}>
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Frequência</label>
                  <select
                    className="nam-select"
                    value={recurrence.kind}
                    onChange={(e) => {
                      const kind = e.target.value as BlockRecurrenceState['kind'];
                      onRecurrenceChange({
                        ...recurrence,
                        kind,
                        interval_value: kind === 'biweekly' ? 1 : recurrence.interval_value,
                      });
                    }}
                  >
                    {(Object.keys(RECURRENCE_LABELS) as Array<keyof typeof RECURRENCE_LABELS>).map((k) => (
                      <option key={k} value={k}>
                        {RECURRENCE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nam-field">
                  <label className="nam-label">Ocorrências</label>
                  <input
                    className="nam-input"
                    type="number"
                    min={2}
                    max={52}
                    value={recurrence.occurrences}
                    onChange={(e) =>
                      onRecurrenceChange({
                        ...recurrence,
                        end_mode: 'occurrences',
                        occurrences: Number(e.target.value) || 2,
                      })
                    }
                  />
                </div>
              </div>
              {(recurrence.kind === 'weekly' || recurrence.kind === 'biweekly') && (
                <div className="nam-dow-chips">
                  {DOW_LABELS.map((label, i) => {
                    const dow = i + 1;
                    const active = recurrence.days_of_week.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        className={`nam-dow-chip${active ? ' nam-dow-chip--active' : ''}`}
                        onClick={() => {
                          const days = active
                            ? recurrence.days_of_week.filter((d) => d !== dow)
                            : [...recurrence.days_of_week, dow].sort((a, b) => a - b);
                          onRecurrenceChange({ ...recurrence, days_of_week: days });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hidePickup ? (
        <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 8 }}>
          <HubCheckbox
            className="nam-checkbox-label"
            checked={pickup.enabled}
            onChange={(enabled) => onPickupChange({ ...pickup, enabled })}
          >
            Incluir Leva e Traz neste bloco
          </HubCheckbox>
          {pickup.enabled && pickupHint ? (
            <p className="nam-aside__muted" style={{ marginTop: 6, fontSize: 13 }}>
              {pickupHint}
            </p>
          ) : null}
          {pickup.enabled ? (
            <div className="nam-pickup" style={{ marginTop: 8 }}>
              <div className="nam-field">
                <label className="nam-label">Serviço de transporte</label>
                <HubSearchableCombobox
                  id={`nam-eb-lt-${blockKey}`}
                  options={ltServiceOptions}
                  value={pickup.lt_service_type_id}
                  onChange={(v) => onPickupChange({ ...pickup, lt_service_type_id: v })}
                  placeholder="Escolher serviço L&T…"
                  clearable={false}
                />
              </div>
              <div
                className="nam-pickup__mode-selector"
                style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0', flexWrap: 'wrap' }}
              >
                {(
                  [
                    { value: 'round_trip', label: 'Ida e volta' },
                    { value: 'pickup_only', label: 'Só busca' },
                    { value: 'delivery_only', label: 'Só retorno' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`hub-clientes__btn hub-clientes__btn--sm${pickup.mode === opt.value ? ' hub-clientes__btn--primary' : ' hub-clientes__btn--ghost'}`}
                    onClick={() => onPickupChange({ ...pickup, mode: opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {pickup.mode !== 'delivery_only' ? (
                <div className="nam-row nam-row--cols2">
                  <HubTimeField
                    id={`nam-eb-lt-before-s-${blockKey}`}
                    label="Busca — início"
                    valueHm={pickup.before_starts_hm}
                    onChangeHm={(hm) => onPickupChange({ ...pickup, before_starts_hm: hm })}
                  />
                  <HubTimeField
                    id={`nam-eb-lt-before-e-${blockKey}`}
                    label="Busca — fim"
                    valueHm={pickup.before_ends_hm}
                    onChangeHm={(hm) => onPickupChange({ ...pickup, before_ends_hm: hm })}
                  />
                </div>
              ) : null}
              {pickup.mode !== 'pickup_only' ? (
                <div className="nam-row nam-row--cols2" style={{ marginTop: 8 }}>
                  <HubTimeField
                    id={`nam-eb-lt-after-s-${blockKey}`}
                    label="Retorno — início"
                    valueHm={pickup.after_starts_hm}
                    onChangeHm={(hm) => onPickupChange({ ...pickup, after_starts_hm: hm })}
                  />
                  <HubTimeField
                    id={`nam-eb-lt-after-e-${blockKey}`}
                    label="Retorno — fim"
                    valueHm={pickup.after_ends_hm}
                    onChangeHm={(hm) => onPickupChange({ ...pickup, after_ends_hm: hm })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default BlockRecurrencePickupFields;
