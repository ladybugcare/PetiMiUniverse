import React, { useEffect, useMemo, useState } from 'react';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import type { HubVaccinationSource } from '../../api/hubClinicalApi';

export type VaccinationFormDraft = {
  source: HubVaccinationSource;
  hub_inventory_item_id: string;
  hub_inventory_lot_id: string;
  vaccine_name: string;
  batch_number: string;
  next_dose_at: string;
  notes: string;
};

export const emptyVaccinationFormDraft = (): VaccinationFormDraft => ({
  source: 'in_clinic',
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
    if (draft.source !== 'in_clinic') {
      setLots([]);
      return;
    }
    setLoadingLots(true);
    void hubInventoryApi.lots
      .list(clinicId)
      .then((r) => setLots(r.lots ?? []))
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, [clinicId, draft.source]);

  const lotsForItem = useMemo(
    () =>
      draft.hub_inventory_item_id
        ? lots.filter((l) => l.item_id === draft.hub_inventory_item_id && l.qty_on_hand > 0)
        : [],
    [lots, draft.hub_inventory_item_id],
  );

  const selectedItem = vaccineItems.find((v) => v.id === draft.hub_inventory_item_id) ?? null;
  const selectedLot = lotsForItem.find((l) => l.id === draft.hub_inventory_lot_id) ?? null;
  const inClinic = draft.source === 'in_clinic';

  const canSubmit =
    !disabled &&
    !submitting &&
    (inClinic
      ? Boolean(draft.hub_inventory_item_id && draft.hub_inventory_lot_id && draft.vaccine_name.trim())
      : Boolean(draft.vaccine_name.trim()));

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
    <div className="hub-cws-rx-form hub-vaccination-form">
      <div className="hub-clientes__field" style={{ minWidth: 200 }}>
        <label className="hub-clientes__label" htmlFor="vac-source">
          Origem
        </label>
        <select
          id="vac-source"
          className="hub-clientes__input"
          value={draft.source}
          disabled={disabled}
          onChange={(e) => {
            const source = e.target.value as HubVaccinationSource;
            if (source === 'external') {
              onChange({
                ...draft,
                source,
                hub_inventory_item_id: '',
                hub_inventory_lot_id: '',
              });
            } else {
              set({ source });
            }
          }}
        >
          <option value="in_clinic">Aplicada na clínica (estoque)</option>
          <option value="external">Vacina externa / histórico</option>
        </select>
      </div>

      {inClinic ? (
        <>
          <div className="hub-clientes__field" style={{ minWidth: 220, flex: 1 }}>
            <label className="hub-clientes__label" htmlFor="vac-item">
              Vacina (estoque)
            </label>
            <select
              id="vac-item"
              className="hub-clientes__input"
              value={draft.hub_inventory_item_id}
              disabled={disabled || vaccineItems.length === 0}
              onChange={(e) => onSelectVaccine(e.target.value)}
            >
              <option value="">Selecione a vacina</option>
              {vaccineItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} — {formatMoneyBrl(it.sale_amount)}
                </option>
              ))}
            </select>
            {vaccineItems.length === 0 ? (
              <p className="hub-clientes__muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Nenhuma vacina no estoque. Cadastre em Estoque → Vacinas e registre uma entrada com lote.
              </p>
            ) : null}
          </div>

          <div className="hub-clientes__field" style={{ minWidth: 200 }}>
            <label className="hub-clientes__label" htmlFor="vac-lot">
              Lote
            </label>
            <select
              id="vac-lot"
              className="hub-clientes__input"
              value={draft.hub_inventory_lot_id}
              disabled={disabled || !draft.hub_inventory_item_id || loadingLots}
              onChange={(e) => onSelectLot(e.target.value)}
            >
              <option value="">Selecione o lote</option>
              {lotsForItem.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lot_code || 'Sem código'} — saldo {lot.qty_on_hand}
                  {lot.expiry_date ? ` — val. ${lot.expiry_date.slice(0, 10)}` : ''}
                </option>
              ))}
            </select>
            {draft.hub_inventory_item_id && !loadingLots && lotsForItem.length === 0 ? (
              <p className="hub-clientes__muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Sem lotes com saldo para esta vacina. Registre entrada de estoque antes de aplicar.
              </p>
            ) : null}
          </div>

          {selectedItem ? (
            <p className="hub-clientes__muted" style={{ width: '100%', margin: 0, fontSize: 13 }}>
              Cobrança na comanda: {formatMoneyBrl(selectedItem.sale_amount)} (produto) + consulta agendada, se houver.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="hub-clientes__field" style={{ minWidth: 200, flex: 1 }}>
            <label className="hub-clientes__label" htmlFor="vac-name-ext">
              Nome da vacina
            </label>
            <input
              id="vac-name-ext"
              className="hub-clientes__input"
              placeholder="Ex.: Vacina Raiva"
              value={draft.vaccine_name}
              disabled={disabled}
              onChange={(e) => set({ vaccine_name: e.target.value })}
            />
          </div>
          <div className="hub-clientes__field" style={{ minWidth: 140 }}>
            <label className="hub-clientes__label" htmlFor="vac-batch-ext">
              Lote / ref.
            </label>
            <input
              id="vac-batch-ext"
              className="hub-clientes__input"
              placeholder="Opcional"
              value={draft.batch_number}
              disabled={disabled}
              onChange={(e) => set({ batch_number: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="hub-clientes__field" style={{ minWidth: 150 }}>
        <label className="hub-clientes__label" htmlFor="vac-next">
          Próxima dose
        </label>
        <input
          id="vac-next"
          type="date"
          className="hub-clientes__input"
          value={draft.next_dose_at}
          disabled={disabled}
          onChange={(e) => set({ next_dose_at: e.target.value })}
        />
      </div>

      <div className="hub-clientes__field" style={{ minWidth: 200, flex: 1 }}>
        <label className="hub-clientes__label" htmlFor="vac-notes">
          Observações
        </label>
        <input
          id="vac-notes"
          className="hub-clientes__input"
          placeholder="Opcional"
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      {selectedLot?.expiry_date ? (
        <p className="hub-clientes__muted" style={{ width: '100%', margin: 0, fontSize: 13 }}>
          Validade do lote selecionado: {selectedLot.expiry_date.slice(0, 10)}
        </p>
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
