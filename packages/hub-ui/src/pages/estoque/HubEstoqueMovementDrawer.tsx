import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, PackagePlus } from 'lucide-react';
import {
  hubInventoryApi,
  type HubInventoryItem,
  type HubInventoryLotRow,
} from '../../api/hubInventoryApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubDateField } from '../../components/HubDateField';
import { HubCancelButton } from '../../components/HubCancelButton';
import { useAlert } from '../../components/AlertProvider';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const FORM_ID = 'hub-estoque-movement-form';

export type HubEstoqueMovementDrawerProps = {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  /** Direção padrão da tela (entradas → in; saídas → out). */
  direction: 'in' | 'out';
  /** Item pré-selecionado (ficha do produto / alerta). */
  preselectedItemId?: string | null;
  canWrite: boolean;
  onSuccess?: () => void;
};

function parseMoneyInput(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/R\$\s*/gi, '')
    .trim()
    .replace(/\s/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) s = s.replace(/,/g, '');
  else if (lastComma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function formatMoneyNumberBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type LotMode = 'existing' | 'new';

const HubEstoqueMovementDrawer: React.FC<HubEstoqueMovementDrawerProps> = ({
  open,
  onClose,
  clinicId,
  direction,
  preselectedItemId,
  canWrite,
  onSuccess,
}) => {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [itemId, setItemId] = useState('');
  const [movementType, setMovementType] = useState<'purchase_in' | 'adjustment_in' | 'adjustment_out'>(
    direction === 'out' ? 'adjustment_out' : 'purchase_in',
  );
  const [lotMode, setLotMode] = useState<LotMode>('new');
  const [lotId, setLotId] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayYmd());
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [updateCatalogCost, setUpdateCatalogCost] = useState(false);
  const [notes, setNotes] = useState('');

  const resetForm = useCallback(
    (presetItem?: string | null) => {
      setItemId(presetItem || '');
      setMovementType(direction === 'out' ? 'adjustment_out' : 'purchase_in');
      setLotMode(direction === 'out' ? 'existing' : 'new');
      setLotId('');
      setLotCode('');
      setExpiryDate('');
      setReceivedAt(todayYmd());
      setQty('1');
      setUnitCost('');
      setUpdateCatalogCost(false);
      setNotes('');
    },
    [direction],
  );

  const load = useCallback(async () => {
    if (!clinicId || !open) return;
    setLoading(true);
    try {
      const [iRes, lRes] = await Promise.all([
        hubInventoryApi.items.list(clinicId, true),
        hubInventoryApi.lots.list(clinicId),
      ]);
      setItems((iRes.items || []).filter((i) => i.active !== false));
      setLots(lRes.lots || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [clinicId, open, showError]);

  useEffect(() => {
    if (!open) return;
    resetForm(preselectedItemId);
    void load();
  }, [open, preselectedItemId, resetForm, load]);

  useEffect(() => {
    if (!itemId) return;
    const item = items.find((i) => i.id === itemId);
    if (item && !unitCost && movementType === 'purchase_in') {
      setUnitCost(formatMoneyNumberBrl(Number(item.cost_amount)));
    }
    // Só pré-preenche quando o item muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const itemOptions: HubComboboxOption[] = useMemo(
    () => items.map((i) => ({ value: i.id, label: i.name })),
    [items],
  );

  const lotsForItem = useMemo(
    () => lots.filter((l) => l.item_id === itemId && l.qty_on_hand > 0),
    [lots, itemId],
  );

  const selectedItem = items.find((i) => i.id === itemId);
  const isIn = movementType === 'purchase_in' || movementType === 'adjustment_in';
  const isPurchase = movementType === 'purchase_in';
  const needsExistingLot = !isIn || lotMode === 'existing';

  const title = direction === 'out' ? 'Registrar saída' : 'Registrar entrada';
  const Icon = direction === 'out' ? ArrowDownUp : PackagePlus;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !clinicId) return;
    if (!itemId) {
      showError('Selecione um item');
      return;
    }
    const qtyNum = Number(String(qty).replace(',', '.'));
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      showError('Informe uma quantidade válida');
      return;
    }

    let cost: number | null = null;
    if (isPurchase && unitCost.trim()) {
      cost = parseMoneyInput(unitCost);
      if (cost == null) {
        showError('Custo unitário inválido');
        return;
      }
    }

    if (needsExistingLot && !lotId) {
      showError('Selecione um lote');
      return;
    }
    if (isIn && lotMode === 'new' && !receivedAt) {
      showError('Informe a data de entrada do lote');
      return;
    }

    setSaving(true);
    try {
      await hubInventoryApi.movements.create({
        clinic_id: clinicId,
        item_id: itemId,
        movement_type: movementType,
        qty: qtyNum,
        unit_cost: isPurchase ? cost : null,
        notes: notes.trim() || null,
        lot_id: needsExistingLot ? lotId : null,
        new_lot:
          isIn && lotMode === 'new'
            ? {
                lot_code: lotCode.trim() || null,
                expiry_date: expiryDate || null,
                received_at: receivedAt,
              }
            : undefined,
      });

      if (isPurchase && updateCatalogCost && cost != null) {
        await hubInventoryApi.items.patch(itemId, {
          clinic_id: clinicId,
          cost_amount: cost,
        });
      }

      showSuccess(isIn ? 'Entrada registrada' : 'Saída registrada');
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao registrar movimento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={<Icon size={20} strokeWidth={2} aria-hidden />}
      subtitle={selectedItem?.name}
      size="default"
      contentKey={`${direction}-${preselectedItemId || 'any'}-${open ? '1' : '0'}`}
      footer={
        <div className="hub-finance-page__drawer-footer">
          <HubCancelButton onClick={onClose} disabled={saving} />
          <button
            type="submit"
            form={FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !canWrite || loading}
          >
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes-drawer__content">
        <form id={FORM_ID} onSubmit={(e) => void handleSubmit(e)}>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="mov-item">
              Item *
            </label>
            <HubSearchableCombobox
              id="mov-item"
              className="hub-combobox--clientes"
              options={itemOptions}
              value={itemId}
              onChange={(v) => {
                setItemId(v);
                setLotId('');
              }}
              placeholder="Selecionar item"
              searchPlaceholder="Buscar item…"
              emptyResultsLabel="Nenhum item encontrado"
              ariaLabel="Item de estoque"
              disabled={Boolean(preselectedItemId) || loading}
            />
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="mov-type">
              Tipo *
            </label>
            <select
              id="mov-type"
              className="hub-clientes__select-input"
              value={movementType}
              onChange={(e) => {
                const t = e.target.value as typeof movementType;
                setMovementType(t);
                if (t === 'adjustment_out') setLotMode('existing');
                if (t === 'purchase_in') setLotMode('new');
              }}
            >
              {direction === 'in' ? (
                <>
                  <option value="purchase_in">Compra</option>
                  <option value="adjustment_in">Ajuste (+)</option>
                </>
              ) : (
                <option value="adjustment_out">Ajuste (−)</option>
              )}
            </select>
          </div>

          {isIn && (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label">Lote</label>
              <div className="hub-estoque__lot-mode">
                <label className="hub-estoque__radio">
                  <input
                    type="radio"
                    name="lot-mode"
                    checked={lotMode === 'new'}
                    onChange={() => setLotMode('new')}
                  />
                  Novo lote
                </label>
                <label className="hub-estoque__radio">
                  <input
                    type="radio"
                    name="lot-mode"
                    checked={lotMode === 'existing'}
                    onChange={() => setLotMode('existing')}
                  />
                  Lote existente
                </label>
              </div>
            </div>
          )}

          {needsExistingLot && (
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="mov-lot">
                Lote *
              </label>
              <select
                id="mov-lot"
                className="hub-clientes__select-input"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                required
              >
                <option value="">Selecione…</option>
                {lotsForItem.map((l) => (
                  <option key={l.id} value={l.id}>
                    {(l.lot_code || 'Sem código') +
                      (l.expiry_date
                        ? ` · val. ${new Date(l.expiry_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
                        : '') +
                      ` · ${l.qty_on_hand} un.`}
                  </option>
                ))}
              </select>
              {itemId && lotsForItem.length === 0 ? (
                <p className="hub-estoque__hint-ean">Nenhum lote com saldo para este item.</p>
              ) : null}
            </div>
          )}

          {isIn && lotMode === 'new' && (
            <>
              <div className="hub-clientes__field">
                <HubDateField
                  id="mov-recv"
                  label="Data de entrada *"
                  valueIso={receivedAt}
                  onChangeIso={(iso) => setReceivedAt(iso || todayYmd())}
                  required
                />
              </div>
              <div className="hub-clientes__field">
                <HubDateField
                  id="mov-exp"
                  label="Data de validade"
                  valueIso={expiryDate}
                  onChangeIso={(iso) => setExpiryDate(iso)}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="mov-lot-code">
                  Número do lote
                </label>
                <input
                  id="mov-lot-code"
                  className="hub-clientes__input"
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </>
          )}

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="mov-qty">
              Quantidade *
            </label>
            <input
              id="mov-qty"
              className="hub-clientes__input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>

          {isPurchase && (
            <>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label">Custo unitário desta compra (R$)</label>
                <div className="hub-servicos__money-field">
                  <span className="hub-servicos__money-prefix">R$</span>
                  <input
                    className="hub-clientes__input"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <p className="hub-estoque__hint-ean">
                  Pode diferir do custo padrão do cadastro (outra compra / outro lote).
                </p>
              </div>
              <div className="hub-clientes__field">
                <HubCheckbox checked={updateCatalogCost} onChange={setUpdateCatalogCost}>
                  Atualizar custo padrão do cadastro
                </HubCheckbox>
              </div>
            </>
          )}

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="mov-notes">
              Notas
            </label>
            <textarea
              id="mov-notes"
              className="hub-clientes__textarea"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </form>
      </div>
    </HubSidePanel>
  );
};

export default HubEstoqueMovementDrawer;
