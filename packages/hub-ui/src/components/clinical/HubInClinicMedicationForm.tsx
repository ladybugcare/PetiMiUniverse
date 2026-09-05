import React, { useEffect, useMemo, useState } from 'react';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubSearchableCombobox } from '../HubSearchableCombobox';
import { HubCwsChoiceChips } from '../../pages/clinica/HubCwsChoiceChips';
import type { AnamnesisChip } from '../../pages/clinica/anamnesisOptions';
import {
  filterEncounterApplicationServices,
  filterMedicationItemsForInClinic,
} from './inClinicMedicationCatalog';

export type InClinicMedicationDraft = {
  hub_service_type_id: string;
  hub_inventory_item_id: string;
  hub_inventory_lot_id: string;
  dose: string;
  use_route: string;
  quantity: string;
  notes: string;
};

export const emptyInClinicMedicationDraft = (): InClinicMedicationDraft => ({
  hub_service_type_id: '',
  hub_inventory_item_id: '',
  hub_inventory_lot_id: '',
  dose: '',
  use_route: '',
  quantity: '1',
  notes: '',
});

const ROUTE_OPTIONS: AnamnesisChip[] = [
  { key: 'IM', label: 'IM', level: 'info' },
  { key: 'IV', label: 'IV', level: 'info' },
  { key: 'SC', label: 'SC', level: 'info' },
  { key: 'Oral', label: 'Oral' },
  { key: 'Tópico', label: 'Tópico' },
];

type Props = {
  clinicId: string;
  draft: InClinicMedicationDraft;
  onChange: (next: InClinicMedicationDraft) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
};

function formatMoneyBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function HubInClinicMedicationForm({
  clinicId,
  draft,
  onChange,
  onSubmit,
  disabled,
  submitting,
}: Props) {
  const [services, setServices] = useState<HubServiceType[]>([]);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);

  const set = (patch: Partial<InClinicMedicationDraft>) => onChange({ ...draft, ...patch });

  useEffect(() => {
    void hubServiceTypesApi
      .list(clinicId)
      .then((r) => {
        const active = filterEncounterApplicationServices(r.service_types ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR'),
        );
        setServices(active);
      })
      .catch(() => setServices([]));
    void hubInventoryApi.items
      .list(clinicId, false, 'medication')
      .then((r) => setItems(filterMedicationItemsForInClinic(r.items ?? [])))
      .catch(() => setItems([]));
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

  const selectedService = services.find((s) => s.id === draft.hub_service_type_id) ?? null;
  const selectedItem = items.find((v) => v.id === draft.hub_inventory_item_id) ?? null;
  const selectedLot = lotsForItem.find((l) => l.id === draft.hub_inventory_lot_id) ?? null;
  const unitLabel = selectedItem?.unit_label?.trim() || 'un.';

  const serviceOptions = useMemo(
    () =>
      services.map((s) => ({
        value: s.id,
        label: `${s.name} — ${formatMoneyBrl(Number(s.sale_amount ?? 0))}`,
      })),
    [services],
  );

  const itemOptions = useMemo(
    () =>
      items.map((it) => ({
        value: it.id,
        label: it.unit_label ? `${it.name} (${it.unit_label})` : it.name,
      })),
    [items],
  );

  const lotOptions = useMemo(
    () =>
      lotsForItem.map((lot) => ({
        value: lot.id,
        label: [
          lot.lot_code || 'Sem código',
          `saldo ${lot.qty_on_hand} ${unitLabel}`,
          lot.expiry_date ? `val. ${lot.expiry_date.slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join(' — '),
      })),
    [lotsForItem, unitLabel],
  );

  const canSubmit =
    !disabled &&
    !submitting &&
    Boolean(draft.hub_service_type_id) &&
    (!draft.hub_inventory_item_id || Boolean(draft.hub_inventory_lot_id));

  return (
    <div className="hub-cws-exam-form">
      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="med-svc">Tipo de aplicação</label>
        <HubSearchableCombobox
          id="med-svc"
          options={serviceOptions}
          value={draft.hub_service_type_id}
          onChange={(next) => set({ hub_service_type_id: next })}
          placeholder="Buscar aplicação cobrada…"
          searchPlaceholder="IM, IV, SC…"
          disabled={disabled || services.length === 0}
          ariaLabel="Tipo de aplicação"
        />
        {services.length === 0 ? (
          <p className="hub-cws-exam-form__hint">
            Nenhuma aplicação cadastrada. Em Serviços → Clínica, crie «Aplicação IM/IV/SC» e marque «Aplicação na
            consulta».
          </p>
        ) : null}
      </div>

      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="med-item">Medicamento</label>
        <HubSearchableCombobox
          id="med-item"
          options={itemOptions}
          value={draft.hub_inventory_item_id}
          onChange={(next) => set({ hub_inventory_item_id: next, hub_inventory_lot_id: '' })}
          placeholder="Buscar no estoque, ou deixar sem baixa…"
          searchPlaceholder="Nome do medicamento…"
          disabled={disabled}
          ariaLabel="Medicamento"
          clearable
        />
        {items.length === 0 ? (
          <p className="hub-cws-exam-form__hint">
            Nenhum medicamento de venda/uso clínico no estoque. Itens de uso interno não aparecem aqui.
          </p>
        ) : null}
      </div>

      <div className="hub-cws-exam-form__meta">
        <HubCwsChoiceChips
          options={ROUTE_OPTIONS}
          value={draft.use_route}
          ariaLabel="Via"
          disabled={disabled}
          onChange={(next) => set({ use_route: next })}
        />
      </div>

      {draft.hub_inventory_item_id ? (
        <div className="hub-cws-field-grid hub-cws-field-grid--2">
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="med-lot">Lote</label>
            <HubSearchableCombobox
              id="med-lot"
              options={lotOptions}
              value={draft.hub_inventory_lot_id}
              onChange={(next) => set({ hub_inventory_lot_id: next })}
              placeholder={loadingLots ? 'Carregando lotes…' : 'Selecionar lote…'}
              searchPlaceholder="Código do lote…"
              disabled={disabled || loadingLots}
              ariaLabel="Lote"
            />
            {!loadingLots && lotsForItem.length === 0 ? (
              <p className="hub-cws-exam-form__hint">
                Sem lotes com saldo. Registre uma entrada antes de baixar o estoque.
              </p>
            ) : null}
          </div>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="med-qty">Quantidade ({unitLabel})</label>
            <input
              id="med-qty"
              inputMode="decimal"
              value={draft.quantity}
              disabled={disabled}
              onChange={(e) => set({ quantity: e.target.value })}
              placeholder="1"
            />
          </div>
        </div>
      ) : null}

      <div className="hub-cws-field-grid hub-cws-field-grid--2">
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="med-dose">Dose</label>
          <input
            id="med-dose"
            value={draft.dose}
            disabled={disabled}
            onChange={(e) => set({ dose: e.target.value })}
            placeholder="Ex.: 0,5 ml"
          />
        </div>
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="med-route">Via</label>
          <input
            id="med-route"
            value={draft.use_route}
            disabled={disabled}
            onChange={(e) => set({ use_route: e.target.value })}
            placeholder="Opcional — ou use os chips"
          />
        </div>
      </div>

      {!draft.hub_inventory_item_id ? (
        <div className="hub-clinic-field hub-cws-field-tight">
          <label htmlFor="med-qty">Quantidade</label>
          <input
            id="med-qty"
            inputMode="decimal"
            value={draft.quantity}
            disabled={disabled}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder="1"
          />
        </div>
      ) : null}

      <div className="hub-clinic-field hub-cws-field-tight">
        <label htmlFor="med-notes">Observações</label>
        <input
          id="med-notes"
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Opcional — reação, local, o que a equipe precisa saber"
        />
      </div>

      {selectedService ? (
        <p className="hub-cws-exam-form__hint">
          Na comanda: {formatMoneyBrl(Number(selectedService.sale_amount ?? 0))} ({selectedService.name})
          {selectedItem
            ? ` · baixa ${draft.quantity || '1'} ${unitLabel} de ${selectedItem.name}${
                selectedLot ? ` (lote ${selectedLot.lot_code || 'sem código'})` : ''
              } — sem cobrança do produto`
            : ''}
          .
        </p>
      ) : null}

      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {submitting ? 'Registrando…' : 'Registrar medicação'}
      </button>
    </div>
  );
}
