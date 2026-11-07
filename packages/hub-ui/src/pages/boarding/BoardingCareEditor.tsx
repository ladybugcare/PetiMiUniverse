import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { HubTimeField } from '../../components/HubTimeField';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import type {
  BoardingBlockStatus,
  BoardingCareBlockKey,
  BoardingCareFeeding,
  BoardingCareHandling,
  BoardingCareMedication,
  BoardingCarePlanBlocks,
  BoardingCareRecreation,
  BoardingCareWalks,
  BoardingSociability,
} from '../../api/hubBoardingApi';
import { BLOCK_STATUS_LABELS, CARE_BLOCK_LABELS, SOCIABILITY_LABELS, blockStatusVariant } from './boardingCareUi';

// ─── Horários ───────────────────────────────────────────────────────────────

const TimesEditor: React.FC<{
  id: string;
  times: string[];
  disabled?: boolean;
  onChange: (times: string[]) => void;
  addLabel?: string;
}> = ({ id, times, disabled, onChange, addLabel = 'Adicionar horário' }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft) return;
    onChange([...new Set([...times, draft])].sort());
    setDraft('');
  };
  return (
    <div className="hub-boarding-care__times">
      {times.length ? (
        <ul className="hub-grooming-drawer__chips hub-boarding-care__chips">
          {times.map((t) => (
            <li key={t} className="hub-grooming-drawer__chip hub-boarding-care__chip">
              {t}
              {!disabled ? (
                <button
                  type="button"
                  className="hub-boarding-care__chip-remove"
                  onClick={() => onChange(times.filter((x) => x !== t))}
                  aria-label={`Remover ${t}`}
                >
                  <X size={12} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled ? (
        <div className="hub-boarding-care__add-row">
          <HubTimeField id={id} valueHm={draft} onChangeHm={setDraft} minuteStep={5} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={!draft}
            onClick={add}
          >
            <Plus size={14} aria-hidden />
            {addLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
};

// ─── Blocos ─────────────────────────────────────────────────────────────────

const FeedingFields: React.FC<{
  idPrefix: string;
  value: BoardingCareFeeding | null;
  disabled?: boolean;
  onChange: (v: BoardingCareFeeding) => void;
}> = ({ idPrefix, value, disabled, onChange }) => {
  const v: BoardingCareFeeding = value ?? { food_source: null, food_name: null, meals: [], restrictions: null };
  const meals = v.meals ?? [];
  const [newTime, setNewTime] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const set = (patch: Partial<BoardingCareFeeding>) => onChange({ ...v, ...patch });
  const foodSourceOptions = useMemo<HubComboboxOption[]>(
    () => [
      { value: 'own', label: 'Do tutor' },
      { value: 'house', label: 'Da casa' },
    ],
    [],
  );

  return (
    <>
      <div className="hub-boarding-care__grid">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-source`}>
            Ração
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-source`}
            options={foodSourceOptions}
            value={v.food_source ?? ''}
            disabled={disabled}
            placeholder="Não informado"
            searchPlaceholder="Buscar…"
            clearable
            onChange={(val) => set({ food_source: (val || null) as BoardingCareFeeding['food_source'] })}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-name`}>
            Marca / tipo
          </label>
          <input
            id={`${idPrefix}-name`}
            className="hub-clientes__input"
            value={v.food_name ?? ''}
            disabled={disabled}
            placeholder="Ex.: Premier filhote"
            onChange={(e) => set({ food_name: e.target.value || null })}
          />
        </div>
      </div>

      <span className="hub-clientes__label">Refeições</span>
      {meals.length ? (
        <ul className="hub-grooming-drawer__lines hub-boarding-care__list">
          {meals.map((m, idx) => (
            <li key={`${m.time}-${idx}`} className="hub-grooming-drawer__line">
              <strong>{m.time}</strong>
              <input
                className="hub-clientes__input hub-boarding-care__inline-input"
                value={m.amount ?? ''}
                disabled={disabled}
                placeholder="Quantidade (ex.: 1 xícara)"
                aria-label={`Quantidade da refeição das ${m.time}`}
                onChange={(e) =>
                  set({ meals: meals.map((x, i) => (i === idx ? { ...x, amount: e.target.value || null } : x)) })
                }
              />
              {!disabled ? (
                <button
                  type="button"
                  className="hub-clientes__icon-btn"
                  onClick={() => set({ meals: meals.filter((_, i) => i !== idx) })}
                  aria-label={`Remover refeição das ${m.time}`}
                >
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hub-grooming-drawer__hint">Nenhuma refeição definida.</p>
      )}
      {!disabled ? (
        <div className="hub-boarding-care__add-row">
          <HubTimeField id={`${idPrefix}-meal-time`} valueHm={newTime} onChangeHm={setNewTime} minuteStep={5} />
          <input
            className="hub-clientes__input hub-boarding-care__inline-input"
            value={newAmount}
            placeholder="Quantidade"
            aria-label="Quantidade da nova refeição"
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={!newTime}
            onClick={() => {
              const next = [...meals.filter((m) => m.time !== newTime), { time: newTime, amount: newAmount || null }];
              next.sort((a, b) => a.time.localeCompare(b.time));
              set({ meals: next });
              setNewTime('');
              setNewAmount('');
            }}
          >
            <Plus size={14} aria-hidden />
            Adicionar refeição
          </button>
        </div>
      ) : null}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={`${idPrefix}-restrictions`}>
          Restrições alimentares
        </label>
        <input
          id={`${idPrefix}-restrictions`}
          className="hub-clientes__input"
          value={v.restrictions ?? ''}
          disabled={disabled}
          placeholder="Ex.: não pode petisco com frango"
          onChange={(e) => set({ restrictions: e.target.value || null })}
        />
      </div>
    </>
  );
};

const MedicationsFields: React.FC<{
  idPrefix: string;
  value: BoardingCareMedication[] | null;
  disabled?: boolean;
  onChange: (v: BoardingCareMedication[] | null) => void;
}> = ({ idPrefix, value, disabled, onChange }) => {
  const list = value ?? [];
  const none = Array.isArray(value) && value.length === 0;
  const update = (idx: number, patch: Partial<BoardingCareMedication>) =>
    onChange(list.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  return (
    <>
      <HubCheckbox checked={none} disabled={disabled} onChange={(c) => onChange(c ? [] : null)}>
        Não toma medicação
      </HubCheckbox>
      {!none ? (
        <>
          {list.map((m, idx) => (
            <div key={idx} className="hub-boarding-care__med">
              <div className="hub-boarding-care__grid">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor={`${idPrefix}-${idx}-name`}>
                    Medicamento
                  </label>
                  <input
                    id={`${idPrefix}-${idx}-name`}
                    className="hub-clientes__input"
                    value={m.name}
                    disabled={disabled}
                    onChange={(e) => update(idx, { name: e.target.value })}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor={`${idPrefix}-${idx}-dose`}>
                    Dose
                  </label>
                  <input
                    id={`${idPrefix}-${idx}-dose`}
                    className="hub-clientes__input"
                    value={m.dose ?? ''}
                    disabled={disabled}
                    placeholder="Ex.: 1 comprimido"
                    onChange={(e) => update(idx, { dose: e.target.value || null })}
                  />
                </div>
              </div>
              <span className="hub-clientes__label">Horários</span>
              <TimesEditor
                id={`${idPrefix}-${idx}-time`}
                times={m.times ?? []}
                disabled={disabled}
                onChange={(times) => update(idx, { times })}
              />
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor={`${idPrefix}-${idx}-instr`}>
                  Como dar
                </label>
                <input
                  id={`${idPrefix}-${idx}-instr`}
                  className="hub-clientes__input"
                  value={m.instructions ?? ''}
                  disabled={disabled}
                  placeholder="Ex.: junto com a comida"
                  onChange={(e) => update(idx, { instructions: e.target.value || null })}
                />
              </div>
              {!disabled ? (
                <button
                  type="button"
                  className="hub-clientes__link-btn"
                  onClick={() => onChange(list.filter((_, i) => i !== idx))}
                >
                  Remover medicamento
                </button>
              ) : null}
            </div>
          ))}
          {!disabled ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => onChange([...list, { name: '', dose: null, times: [], instructions: null }])}
            >
              <Plus size={14} aria-hidden />
              Adicionar medicamento
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );
};

const WalksFields: React.FC<{
  idPrefix: string;
  value: BoardingCareWalks | null;
  disabled?: boolean;
  onChange: (v: BoardingCareWalks) => void;
}> = ({ idPrefix, value, disabled, onChange }) => {
  const v = value ?? { times: [], notes: null };
  return (
    <>
      <TimesEditor
        id={`${idPrefix}-time`}
        times={v.times ?? []}
        disabled={disabled}
        onChange={(times) => onChange({ ...v, times })}
      />
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={`${idPrefix}-notes`}>
          Observações
        </label>
        <input
          id={`${idPrefix}-notes`}
          className="hub-clientes__input"
          value={v.notes ?? ''}
          disabled={disabled}
          placeholder="Ex.: puxa na guia, evitar outros cães"
          onChange={(e) => onChange({ ...v, notes: e.target.value || null })}
        />
      </div>
    </>
  );
};

const HandlingFields: React.FC<{
  idPrefix: string;
  value: BoardingCareHandling | null;
  disabled?: boolean;
  onChange: (v: BoardingCareHandling) => void;
}> = ({ idPrefix, value, disabled, onChange }) => {
  const v = value ?? { sociability: null, group_play_allowed: null, contact_restrictions: null, special_care: null };
  const set = (patch: Partial<BoardingCareHandling>) => onChange({ ...v, ...patch });
  return (
    <>
      <span className="hub-clientes__label">Convivência</span>
      <div className="hub-clientes__btn-row hub-boarding-care__choice">
        {(Object.keys(SOCIABILITY_LABELS) as BoardingSociability[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm ${v.sociability === s ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
            disabled={disabled}
            aria-pressed={v.sociability === s}
            onClick={() =>
              set({
                sociability: v.sociability === s ? null : s,
                group_play_allowed: s === 'isolated' ? false : v.group_play_allowed,
              })
            }
          >
            {SOCIABILITY_LABELS[s]}
          </button>
        ))}
      </div>
      <HubCheckbox
        checked={v.group_play_allowed !== false}
        disabled={disabled || v.sociability === 'isolated'}
        onChange={(c) => set({ group_play_allowed: c })}
      >
        Pode participar de recreação em grupo
      </HubCheckbox>
      <div className="hub-clientes__field hub-boarding-care__spaced">
        <label className="hub-clientes__label" htmlFor={`${idPrefix}-contact`}>
          Restrições de contato
        </label>
        <input
          id={`${idPrefix}-contact`}
          className="hub-clientes__input"
          value={v.contact_restrictions ?? ''}
          disabled={disabled}
          placeholder="Ex.: não juntar com machos, medo de gatos"
          onChange={(e) => set({ contact_restrictions: e.target.value || null })}
        />
      </div>
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={`${idPrefix}-special`}>
          Cuidados especiais
        </label>
        <input
          id={`${idPrefix}-special`}
          className="hub-clientes__input"
          value={v.special_care ?? ''}
          disabled={disabled}
          placeholder="Ex.: idoso, não sobe escada"
          onChange={(e) => set({ special_care: e.target.value || null })}
        />
      </div>
    </>
  );
};

const RecreationFields: React.FC<{
  idPrefix: string;
  value: BoardingCareRecreation | null;
  groupPlayAllowed: boolean;
  disabled?: boolean;
  onChange: (v: BoardingCareRecreation) => void;
}> = ({ idPrefix, value, groupPlayAllowed, disabled, onChange }) => {
  const v = value ?? { allowed: null, times: [] };
  return (
    <>
      <HubCheckbox
        checked={v.allowed !== false && groupPlayAllowed}
        disabled={disabled || !groupPlayAllowed}
        onChange={(c) => onChange({ ...v, allowed: c })}
      >
        Participa da recreação
      </HubCheckbox>
      {!groupPlayAllowed ? (
        <p className="hub-grooming-drawer__hint">O manejo não permite recreação em grupo.</p>
      ) : v.allowed !== false ? (
        <>
          <p className="hub-grooming-drawer__hint">Sem horários próprios, segue as janelas de recreação da unidade.</p>
          <TimesEditor
            id={`${idPrefix}-time`}
            times={v.times ?? []}
            disabled={disabled}
            onChange={(times) => onChange({ ...v, times })}
          />
        </>
      ) : null}
    </>
  );
};

// ─── Editor ─────────────────────────────────────────────────────────────────

export type BoardingCareEditorProps = {
  idPrefix: string;
  blocks: BoardingCareBlockKey[];
  value: BoardingCarePlanBlocks;
  onChange: (next: BoardingCarePlanBlocks, changedBlock: BoardingCareBlockKey) => void;
  disabled?: boolean;
  /** Plano da estadia: selo Herdado/Confirmado/Alterado/Pendente por bloco. */
  statusByBlock?: Partial<Record<BoardingCareBlockKey, BoardingBlockStatus>>;
  onConfirmBlock?: (key: BoardingCareBlockKey) => void;
  /** Blocos alterados que também vão para a ficha permanente. */
  saveToProfile?: { selected: Set<BoardingCareBlockKey>; onToggle: (key: BoardingCareBlockKey) => void } | null;
  /** Blocos editados e ainda não salvos. */
  dirtyBlocks?: Set<BoardingCareBlockKey>;
};

const BoardingCareEditor: React.FC<BoardingCareEditorProps> = ({
  idPrefix,
  blocks,
  value,
  onChange,
  disabled,
  statusByBlock,
  onConfirmBlock,
  saveToProfile,
  dirtyBlocks,
}) => {
  const set = <K extends BoardingCareBlockKey>(key: K, v: BoardingCarePlanBlocks[K]) =>
    onChange({ ...value, [key]: v }, key);
  const groupPlayAllowed = value.handling?.group_play_allowed !== false && value.handling?.sociability !== 'isolated';

  return (
    <div className="hub-boarding-care">
      {blocks.map((key) => {
        const status = statusByBlock?.[key];
        const canConfirm = Boolean(onConfirmBlock) && !disabled && (status === 'inherited' || status === 'pending');
        return (
          <section key={key} className="hub-grooming-drawer__section hub-boarding-care__block">
            <div className="hub-grooming-drawer__heading-row">
              <h4 className="hub-grooming-drawer__heading">{CARE_BLOCK_LABELS[key]}</h4>
              <div className="hub-boarding-care__block-actions">
                {status ? (
                  <span className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${blockStatusVariant(status)}`}>
                    {BLOCK_STATUS_LABELS[status]}
                  </span>
                ) : null}
                {canConfirm ? (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                    onClick={() => onConfirmBlock?.(key)}
                  >
                    Confirmar
                  </button>
                ) : null}
              </div>
            </div>
            <div className="hub-boarding-care__body">
              {key === 'feeding' ? (
                <FeedingFields idPrefix={`${idPrefix}-feeding`} value={value.feeding} disabled={disabled} onChange={(v) => set('feeding', v)} />
              ) : null}
              {key === 'medications' ? (
                <MedicationsFields
                  idPrefix={`${idPrefix}-med`}
                  value={value.medications}
                  disabled={disabled}
                  onChange={(v) => set('medications', v)}
                />
              ) : null}
              {key === 'walks' ? (
                <WalksFields idPrefix={`${idPrefix}-walks`} value={value.walks} disabled={disabled} onChange={(v) => set('walks', v)} />
              ) : null}
              {key === 'handling' ? (
                <HandlingFields idPrefix={`${idPrefix}-handling`} value={value.handling} disabled={disabled} onChange={(v) => set('handling', v)} />
              ) : null}
              {key === 'recreation' ? (
                <RecreationFields
                  idPrefix={`${idPrefix}-rec`}
                  value={value.recreation}
                  groupPlayAllowed={groupPlayAllowed}
                  disabled={disabled}
                  onChange={(v) => set('recreation', v)}
                />
              ) : null}
              {saveToProfile && key !== 'recreation' && dirtyBlocks?.has(key) ? (
                <HubCheckbox
                  checked={saveToProfile.selected.has(key)}
                  disabled={disabled}
                  onChange={() => saveToProfile.onToggle(key)}
                  className="hub-boarding-care__save-profile"
                >
                  Salvar também na ficha do pet
                </HubCheckbox>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default BoardingCareEditor;
