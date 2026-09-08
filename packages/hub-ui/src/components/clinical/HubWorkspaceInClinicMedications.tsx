import React, { useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  type HubEncounter,
  type HubMedicationAdministration,
} from '../../api/hubClinicalApi';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import { useAlert } from '../AlertProvider';
import { HubCwsStatusPills } from '../../pages/clinica/HubCwsStatusPills';
import {
  formatStockQty,
  stockQtyFromConsumption,
} from '../../pages/estoque/inventoryContentUtils';
import {
  emptyInClinicMedicationDraft,
  HubInClinicMedicationForm,
  type InClinicMedicationDraft,
} from './HubInClinicMedicationForm';

function formatMoneyBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function HubWorkspaceInClinicMedications({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
  /** Mantido por compatibilidade com o card tabulado. */
  formOnly?: boolean;
}) {
  const { showError, showSuccess, showConfirm } = useAlert();
  const [items, setItems] = useState<HubMedicationAdministration[]>([]);
  const [draft, setDraft] = useState<InClinicMedicationDraft>(emptyInClinicMedicationDraft);
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    hubClinicalApi
      .listMedicationAdministrations(clinicId, {
        petId: encounter.pet_id ?? undefined,
        encounterId: encounter.id,
      })
      .then((r) => setItems(r.administrations ?? []));

  useEffect(() => {
    void reload();
  }, [clinicId, encounter.id, encounter.pet_id]);

  const stats = useMemo(() => {
    let comEstoque = 0;
    for (const it of items) {
      if (it.hub_inventory_item_id) comEstoque += 1;
    }
    return { total: items.length, comEstoque, semEstoque: items.length - comEstoque };
  }, [items]);

  const submitAdministration = async (confirmStockOut: boolean) => {
    if (!encounter.pet_id) return;
    const qty = Number(String(draft.quantity).replace(',', '.'));
    setSubmitting(true);
    try {
      await hubClinicalApi.createMedicationAdministration({
        clinic_id: clinicId,
        pet_id: encounter.pet_id,
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        hub_staff_member_id: encounter.hub_staff_member_id ?? undefined,
        hub_service_type_id: draft.hub_service_type_id,
        hub_inventory_item_id: draft.hub_inventory_item_id || undefined,
        hub_inventory_lot_id: draft.hub_inventory_lot_id || undefined,
        dose: draft.dose.trim() || undefined,
        use_route: draft.use_route.trim() || undefined,
        quantity: qty,
        notes: draft.notes.trim() || undefined,
        confirm_stock_out: confirmStockOut || undefined,
      });
      setDraft(emptyInClinicMedicationDraft());
      await reload();
      showSuccess(
        draft.hub_inventory_item_id
          ? 'Medicação registrada. Serviço entra na comanda; estoque baixado (sem cobrança do produto).'
          : 'Medicação registrada. O serviço de aplicação entra na comanda ao cobrar.',
      );
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar medicação');
    } finally {
      setSubmitting(false);
    }
  };

  const add = async () => {
    if (readOnly || submitting) return;
    if (!encounter.pet_id) {
      showError('Vincule um pet ao atendimento para registrar a medicação.');
      return;
    }
    if (!draft.hub_service_type_id) {
      showError('Selecione o serviço que será cobrado.');
      return;
    }
    if (draft.hub_inventory_item_id && !draft.hub_inventory_lot_id) {
      showError('Selecione o lote do medicamento.');
      return;
    }
    const qty = Number(String(draft.quantity).replace(',', '.'));
    if (!(qty > 0)) {
      showError('Informe uma quantidade válida.');
      return;
    }

    if (!draft.hub_inventory_item_id) {
      await submitAdministration(false);
      return;
    }

    try {
      const [itemsRes, lotsRes] = await Promise.all([
        hubInventoryApi.items.list(clinicId, false, 'medication'),
        hubInventoryApi.lots.list(clinicId),
      ]);
      const inv = (itemsRes.items ?? []).find((i) => i.id === draft.hub_inventory_item_id);
      const lot = (lotsRes.lots ?? []).find((l) => l.id === draft.hub_inventory_lot_id);
      const contentQty =
        inv?.content_qty != null && Number(inv.content_qty) > 0 ? Number(inv.content_qty) : null;
      const qtyUnit =
        contentQty != null ? inv?.content_unit?.trim() || 'ml' : inv?.unit_label?.trim() || 'un.';
      const stockUnit = inv?.unit_label?.trim() || 'un.';
      const stockQty = stockQtyFromConsumption(qty, contentQty);
      const stockPart =
        contentQty != null
          ? `${formatStockQty(qty)} ${qtyUnit} (${formatStockQty(stockQty)} ${stockUnit}`
          : `${formatStockQty(qty)} ${stockUnit}`;
      const lotPart = lot?.lot_code ? `, lote ${lot.lot_code}` : '';
      const name = inv?.name || 'medicamento';
      showConfirm(
        `Confirmar baixa de ${stockPart}${contentQty != null ? ')' : ''}${lotPart} de ${name}? O estoque só será reduzido depois desta confirmação.`,
        () => {
          void submitAdministration(true);
        },
        'Confirmar baixa de estoque',
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao preparar confirmação de baixa');
    }
  };

  const blockReason = !encounter.pet_id
    ? 'Vincule um pet ao atendimento para registrar medicação cobrável.'
    : null;

  return (
    <>
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: stats.total },
          { label: 'Com estoque', value: stats.comEstoque, tone: 'amber' },
          { label: 'Sem baixa', value: stats.semEstoque, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Registre o que foi aplicado agora. O tutor paga o tipo de aplicação; medicamento e lote baixam o estoque só
        após confirmação, sem cobrança do produto.
      </p>

      {blockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {blockReason}
        </p>
      ) : null}

      {!readOnly && encounter.pet_id ? (
        <HubInClinicMedicationForm
          clinicId={clinicId}
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void add()}
          disabled={readOnly}
          submitting={submitting}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Medicações deste atendimento</strong>
          </div>
          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Aplicação</th>
                  <th>Medicamento</th>
                  <th>Dose / via</th>
                  <th>Cobrança</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong>{it.service_name}</strong>
                    </td>
                    <td className="hub-clientes__muted">
                      {it.medication_name || '—'}
                      {it.batch_number ? (
                        <div style={{ fontSize: 12 }}>lote {it.batch_number}</div>
                      ) : null}
                      {it.hub_inventory_item_id && it.quantity != null ? (
                        <div style={{ fontSize: 12 }}>
                          qtd. {it.quantity}
                          {it.quantity_unit ? ` ${it.quantity_unit}` : ''}
                          {it.stock_qty != null && it.stock_qty !== it.quantity
                            ? ` → ${it.stock_qty} no estoque`
                            : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="hub-clientes__muted">
                      {[it.dose, it.use_route].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{formatMoneyBrl(it.service_price)}</td>
                    <td className="hub-clientes__muted">
                      {it.administered_at
                        ? new Date(it.administered_at).toLocaleString('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="hub-cws-exam-empty">Nenhuma medicação aplicada neste atendimento ainda.</p>
      )}
    </>
  );
}
