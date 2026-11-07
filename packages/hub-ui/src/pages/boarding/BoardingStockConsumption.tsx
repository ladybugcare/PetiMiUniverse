import React, { useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';

type Props = { clinicId: string; reservationId: string };

/** Consumo de estoque vinculado à estadia (ração da casa, medicamento, tapete higiênico…). */
const BoardingStockConsumption: React.FC<Props> = ({ clinicId, reservationId }) => {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [lots, setLots] = useState<HubInventoryLotRow[]>([]);
  const [itemId, setItemId] = useState('');
  const [lotId, setLotId] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([hubInventoryApi.items.list(clinicId), hubInventoryApi.lots.list(clinicId)])
      .then(([itemsRes, lotsRes]) => {
        setItems(itemsRes.items ?? []);
        setLots(lotsRes.lots ?? []);
      })
      .catch(() => {});
  }, [clinicId]);

  if (!items.length) return null;

  const lotsForItem = lots.filter((l) => l.item_id === itemId && l.qty_on_hand > 0);

  const submit = async () => {
    const n = parseFloat(qty.replace(',', '.'));
    if (!itemId || !lotId || !n || n <= 0) return;
    setBusy(true);
    try {
      await hubInventoryApi.movements.create({
        clinic_id: clinicId,
        item_id: itemId,
        lot_id: lotId,
        movement_type: 'adjustment_out',
        qty: n,
        notes: notes.trim() || null,
        reference_type: 'hub_boarding_reservation',
        reference_id: reservationId,
      });
      showSuccess('Consumo registrado no estoque');
      setItemId('');
      setLotId('');
      setQty('1');
      setNotes('');
      const lotsRes = await hubInventoryApi.lots.list(clinicId);
      setLots(lotsRes.lots ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar consumo');
    } finally {
      setBusy(false);
    }
  };

  const itemOptions = useMemo(
    () => items.map((si) => ({ value: si.id, label: si.name })),
    [items],
  );
  const lotOptions = useMemo(
    () =>
      lotsForItem.map((l) => ({
        value: l.id,
        label:
          (l.lot_code || 'Sem código') +
          (l.expiry_date ? ` · val. ${new Date(`${l.expiry_date}T12:00:00`).toLocaleDateString('pt-BR')}` : '') +
          ` · ${l.qty_on_hand} un.`,
      })),
    [lotsForItem],
  );

  return (
    <section className="hub-grooming-drawer__section">
      <h4 className="hub-grooming-drawer__heading">Consumo de estoque</h4>
      <div className="hub-boarding-care__grid">
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="boarding-stock-item">
            Item
          </label>
          <HubSearchableCombobox
            id="boarding-stock-item"
            options={itemOptions}
            value={itemId}
            placeholder="Selecione…"
            searchPlaceholder="Buscar item…"
            clearable
            onChange={(val) => {
              setItemId(val);
              setLotId('');
            }}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="boarding-stock-lot">
            Lote
          </label>
          <HubSearchableCombobox
            id="boarding-stock-lot"
            options={lotOptions}
            value={lotId}
            disabled={!itemId}
            placeholder="Selecione…"
            searchPlaceholder="Buscar lote…"
            clearable
            onChange={setLotId}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="boarding-stock-qty">
            Quantidade
          </label>
          <input
            id="boarding-stock-qty"
            inputMode="decimal"
            className="hub-clientes__input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="boarding-stock-notes">
            Observação
          </label>
          <input
            id="boarding-stock-notes"
            className="hub-clientes__input"
            value={notes}
            placeholder="Opcional"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
        disabled={busy || !itemId || !lotId || !parseFloat(qty.replace(',', '.'))}
        onClick={() => void submit()}
      >
        {busy ? 'Registrando…' : 'Registrar consumo'}
      </button>
    </section>
  );
};

export default BoardingStockConsumption;
