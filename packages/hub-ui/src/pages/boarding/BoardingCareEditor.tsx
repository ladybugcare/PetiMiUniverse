import React, { useMemo, useState } from 'react';
import { Bone, Footprints, HeartHandshake, Pill, Plus, Trees, X, type LucideIcon } from 'lucide-react';
import { HubTimeField } from '../../components/HubTimeField';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import type {
  BoardingBlockStatus,
  BoardingCareBlockKey,
  BoardingCareFeeding,
  BoardingCareHandling,
  BoardingCareMeal,
  BoardingCareMealSlot,
  BoardingCareMedication,
  BoardingCarePlanBlocks,
  BoardingCareRecreation,
  BoardingCareWalks,
  BoardingSociability,
} from '../../api/hubBoardingApi';
import {
  BLOCK_STATUS_LABELS,
  CARE_BLOCK_LABELS,
  CARE_MEAL_SLOTS,
  CARE_MEAL_SLOT_LABELS,
  SOCIABILITY_LABELS,
  blockStatusVariant,
} from './boardingCareUi';

const CARE_BLOCK_ICONS: Record<BoardingCareBlockKey, LucideIcon> = {
  feeding: Bone,
  medications: Pill,
  walks: Footprints,
  handling: HeartHandshake,
  recreation: Trees,
};

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
          {times
            .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
            .map((t) => (
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
  const mealBySlot = useMemo(() => {
    const map = new Map<BoardingCareMealSlot, BoardingCareMeal>();
    for (const m of meals) {
      if (m.slot) map.set(m.slot, m);
    }
    return map;
  }, [meals]);
  const set = (patch: Partial<BoardingCareFeeding>) => onChange({ ...v, ...patch });
  const foodSourceOptions = useMemo<HubComboboxOption[]>(
    () => [
      { value: 'own', label: 'Do tutor' },
      { value: 'house', label: 'Da casa' },
    ],
    [],
  );

  const toggleSlot = (slot: BoardingCareMealSlot, on: boolean) => {
    if (on) {
      if (mealBySlot.has(slot)) return;
      const next = [...meals.filter((m) => m.slot !== slot), { slot, amount: null, notes: null }];
      next.sort((a, b) => CARE_MEAL_SLOTS.indexOf(a.slot) - CARE_MEAL_SLOTS.indexOf(b.slot));
      set({ meals: next });
      return;
    }
    set({ meals: meals.filter((m) => m.slot !== slot) });
  };

  const setAmount = (slot: BoardingCareMealSlot, amount: string) => {
    set({
      meals: meals.map((m) => (m.slot === slot ? { ...m, amount: amount || null } : m)),
    });
  };

  const feedsOnSite = v.feeds_on_site !== false;

  return (
    <>
      <HubCheckbox
        id={`${idPrefix}-feeds-on-site`}
        checked={!feedsOnSite}
        disabled={disabled}
        onChange={(off) =>
          off
            ? set({
                feeds_on_site: false,
                meals: [],
                food_source: null,
                food_name: null,
                restrictions: null,
              })
            : set({ feeds_on_site: true })
        }
      >
        Não come no estabelecimento (já vem alimentado)
      </HubCheckbox>

      {feedsOnSite ? (
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

          <span className="hub-clientes__label">Refeições do dia</span>
          <p className="hub-grooming-drawer__hint">
            Marque os períodos em que o pet come. O horário de cada período é o da rotina da unidade.
          </p>
          <ul className="hub-boarding-care__list hub-boarding-care__meal-slots">
            {CARE_MEAL_SLOTS.map((slot) => {
              const selected = mealBySlot.has(slot);
              const amount = mealBySlot.get(slot)?.amount ?? '';
              return (
                <li key={slot} className="hub-boarding-care__meal-slot">
                  <HubCheckbox
                    checked={selected}
                    disabled={disabled}
                    onChange={(c) => toggleSlot(slot, c)}
                    id={`${idPrefix}-meal-${slot}`}
                  >
                    {CARE_MEAL_SLOT_LABELS[slot]}
                  </HubCheckbox>
                  {selected ? (
                    <input
                      className="hub-clientes__input hub-boarding-care__inline-input"
                      value={amount}
                      disabled={disabled}
                      placeholder="Quantidade (ex.: 1 xícara)"
                      aria-label={`Quantidade — ${CARE_MEAL_SLOT_LABELS[slot]}`}
                      onChange={(e) => setAmount(slot, e.target.value)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

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
      ) : (
        <p className="hub-grooming-drawer__hint">Sem refeições na rotina — o pet não come aqui.</p>
      )}
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
                    placeholder="Ex.: Prediderm, Dipirona gotas"
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
                    placeholder="Ex.: 1 comprimido, 5 gotas"
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
                  placeholder="Ex.: com a ração da manhã, esconder no petisco"
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
          Observações do passeio
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
        Pode participar de atividades em grupo
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
        Participa das atividades da unidade
      </HubCheckbox>
      {!groupPlayAllowed ? (
        <p className="hub-grooming-drawer__hint">O manejo não permite atividades em grupo.</p>
      ) : v.allowed !== false ? (
        <>
          <p className="hub-grooming-drawer__hint">
            As atividades são as definidas pelo estabelecimento. Horários extras só se forem diferentes do padrão.
          </p>
          <TimesEditor
            id={`${idPrefix}-time`}
            times={v.times ?? []}
            disabled={disabled}
            onChange={(times) => onChange({ ...v, times })}
            addLabel="Horário extra"
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
        const Icon = CARE_BLOCK_ICONS[key];
        return (
          <section key={key} className="hub-boarding-care__block" aria-labelledby={`${idPrefix}-block-${key}`}>
            <header className="hub-boarding-care__block-header">
              <div className="hub-boarding-care__block-title">
                <span className="hub-boarding-care__block-icon" aria-hidden>
                  <Icon size={18} strokeWidth={2} />
                </span>
                <h4 id={`${idPrefix}-block-${key}`} className="hub-boarding-care__block-heading">
                  {CARE_BLOCK_LABELS[key]}
                </h4>
              </div>
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
            </header>
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
