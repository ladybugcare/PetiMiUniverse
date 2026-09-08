import React, { useEffect, useMemo, useState } from 'react';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { HubDateField } from '../HubDateField';
import { HubSearchableCombobox } from '../HubSearchableCombobox';

export type VaccinationFormDraft = {
  hub_inventory_item_id: string;
  hub_inventory_lot_id: string;
  vaccine_name: string;
  batch_number: string;
  next_dose_at: string;
  notes: string;
};

export const emptyVaccinationFormDraft = (): VaccinationFormDraft => ({
  hub_inventory_item_id: '',
  hub_inventory_lot_id: '',
  vaccine_name: '',
  batch_number: '',
  next_dose_at: '',
  notes: '',
});

type Props = {
  clinicId: string;
  draft: VaccinationFormDraft;
  onChange: (next: VaccinationFormDraft) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
};

function formatMoneyBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function HubVaccinationForm({
  clinicId,
  draft,
  onChange,
  onSubmit,
  disabled,
  submitting,
}: Props) {
  const [vaccineItems, setVaccineItems] = useState<HubInventoryItem[]>([]);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);

  const set = (patch: Partial<VaccinationFormDraft>) => onChange({ ...draft, ...patch });

  useEffect(() => {
    void hubInventoryApi.items
      .list(clinicId, false, 'vaccine')
      .then((r) => setVaccineItems(r.items ?? []))
      .catch(() => setVaccineItems([]));
  }, [clinicId]);

  useEffect(() => {
    setLoadingLots(true);
    void hubInventoryApi.lots
      .list(clinicId)
      .then((r) => setLots(r.lots ?? []))
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, [clinicId]);

  const lotsForItem = useMemo(
    () =>
      draft.hub_inventory_item_id
        ? lots.filter((l) => l.item_id === draft.hub_inventory_item_id && l.qty_on_hand > 0)
        : [],
    [lots, draft.hub_inventory_item_id],
  );

  const selectedItem = vaccineItems.find((v) => v.id === draft.hub_inventory_item_id) ?? null;
  const selectedLot = lotsForItem.find((l) => l.id === draft.hub_inventory_lot_id) ?? null;

  const vaccineOptions = useMemo(
    () =>
      vaccineItems.map((it) => ({
        value: it.id,
        label: `${it.name} — ${formatMoneyBrl(it.sale_amount)}`,
      })),
    [vaccineItems],
  );

  const lotOptions = useMemo(
    () =>
      lotsForItem.map((lot) => ({
        value: lot.id,
        label: [
          lot.lot_code || 'Sem código',
          `saldo ${lot.qty_on_hand}`,
          lot.expiry_date ? `val. ${lot.expiry_date.slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join(' — '),
      })),
    [lotsForItem],
  );

  const canSubmit =
    !disabled && !submitting && Boolean(draft.hub_inventory_item_id && draft.vaccine_name.trim());

  const onSelectVaccine = (itemId: string) => {
    const item = vaccineItems.find((v) => v.id === itemId);
    set({
      hub_inventory_item_id: itemId,
      hub_inventory_lot_id: '',
      vaccine_name: item?.name ?? '',
      batch_number: '',
    });
  };

  const onSelectLot = (lotId: string) => {
    const lot = lotsForItem.find((l) => l.id === lotId);
    set({
      hub_inventory_lot_id: lotId,
      batch_number: lot?.lot_code?.trim() ?? '',
    });
  };

  return (
    <div className="hub-cws-exam-form">
      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="vac-item">Vacina</label>
        <HubSearchableCombobox
          id="vac-item"
          options={vaccineOptions}
          value={draft.hub_inventory_item_id}
          onChange={onSelectVaccine}
          placeholder="Buscar no estoque…"
          searchPlaceholder="Raiva, V10, tríplice…"
          disabled={disabled || vaccineItems.length === 0}
          ariaLabel="Vacina"
        />
        {vaccineItems.length === 0 ? (
          <p className="hub-cws-exam-form__hint">
            Nenhuma vacina no estoque. Cadastre em Estoque → Vacinas e registre uma entrada com lote.
          </p>
        ) : null}
      </div>

      <div className="hub-cws-field-grid hub-cws-field-grid--2">
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="vac-lot">Lote</label>
          <HubSearchableCombobox
            id="vac-lot"
            options={lotOptions}
            value={draft.hub_inventory_lot_id}
            onChange={onSelectLot}
            placeholder={
              !draft.hub_inventory_item_id
                ? 'Selecione a vacina primeiro'
                : loadingLots
                  ? 'Carregando lotes…'
                  : 'Opcional'
            }
            searchPlaceholder="Código do lote…"
            disabled={disabled || !draft.hub_inventory_item_id || loadingLots}
            ariaLabel="Lote"
            clearable
          />
          {draft.hub_inventory_item_id && !loadingLots && lotsForItem.length === 0 ? (
            <p className="hub-cws-exam-form__hint">
              Nenhum lote com saldo. Pode registrar sem baixa — o item entra na comanda do mesmo jeito.
            </p>
          ) : null}
        </div>
        <div className="hub-clinic-field hub-cws-field-tight">
          <HubDateField
            id="vac-next"
            label="Próxima dose"
            valueIso={draft.next_dose_at}
            onChangeIso={(next_dose_at) => set({ next_dose_at })}
            disabled={disabled}
            showTodayButton={false}
          />
        </div>
      </div>

      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="vac-notes">Observações</label>
        <input
          id="vac-notes"
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Opcional — protocolo, reação, o que a equipe precisa saber"
        />
      </div>

      {selectedItem ? (
        <p className="hub-cws-exam-form__hint">
          Cobrança na comanda: {formatMoneyBrl(selectedItem.sale_amount)} (produto) + consulta agendada, se houver.
        </p>
      ) : null}
      {selectedLot?.expiry_date ? (
        <p className="hub-cws-exam-form__hint">Validade do lote selecionado: {selectedLot.expiry_date.slice(0, 10)}</p>
      ) : null}

      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {submitting ? 'Registrando…' : 'Registrar vacina'}
      </button>
    </div>
  );
}
