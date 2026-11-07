import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import {
  hubBoardingApi,
  type BoardingBelonging,
  type BoardingBelongingCategory,
  type BoardingBelongingCheckout,
} from '../../api/hubBoardingApi';
import { BELONGING_CATEGORY_LABELS, BELONGING_CHECKOUT_LABELS } from './boardingCareUi';

export type BelongingDraft = { category: BoardingBelongingCategory; description: string; quantity: number };

const CHECKOUT_VARIANT: Record<BoardingBelongingCheckout, string> = {
  pending: 'waiting',
  returned: 'done',
  missing: 'progress',
  consumed: 'neutral',
};

/** Formulário curto de item (categoria, descrição, quantidade). */
export const BelongingAddRow: React.FC<{
  idPrefix: string;
  busy?: boolean;
  onAdd: (draft: BelongingDraft) => void | Promise<void>;
}> = ({ idPrefix, busy, onAdd }) => {
  const [category, setCategory] = useState<BoardingBelongingCategory>('food');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');

  const submit = async () => {
    const desc = description.trim() || BELONGING_CATEGORY_LABELS[category];
    await onAdd({ category, description: desc, quantity: Math.max(1, parseInt(quantity, 10) || 1) });
    setDescription('');
    setQuantity('1');
  };

  return (
    <div className="hub-boarding-care__add-row hub-boarding-belongings__add">
      <HubSearchableCombobox
        id={`${idPrefix}-cat`}
        className="hub-boarding-belongings__cat"
        ariaLabel="Categoria do pertence"
        options={(Object.keys(BELONGING_CATEGORY_LABELS) as BoardingBelongingCategory[]).map((c) => ({
          value: c,
          label: BELONGING_CATEGORY_LABELS[c],
        }))}
        value={category}
        placeholder="Categoria"
        clearable={false}
        onChange={(val) => setCategory((val || 'food') as BoardingBelongingCategory)}
      />
      <input
        className="hub-clientes__input hub-boarding-care__inline-input"
        value={description}
        placeholder="Descrição (ex.: pote azul, 2 kg)"
        aria-label="Descrição do pertence"
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <input
        className="hub-clientes__input hub-boarding-belongings__qty"
        inputMode="numeric"
        value={quantity}
        aria-label="Quantidade"
        onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
      />
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
        disabled={busy}
        onClick={() => void submit()}
      >
        <Plus size={14} aria-hidden />
        Adicionar
      </button>
    </div>
  );
};

type Props = {
  clinicId: string;
  reservationId: string;
  belongings: BoardingBelonging[];
  /** `manage`: entrada (adicionar/remover). `checkout`: conferência de devolução. */
  variant: 'manage' | 'checkout' | 'view';
  onChanged: () => void | Promise<void>;
};

const BoardingBelongingsSection: React.FC<Props> = ({ clinicId, reservationId, belongings, variant, onChanged }) => {
  const { showError } = useAlert();
  const [busy, setBusy] = useState(false);

  const wrap = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || msg);
    } finally {
      setBusy(false);
    }
  };

  const total = belongings.reduce((s, b) => s + (Number(b.quantity) || 1), 0);
  const pendingReturn = belongings.filter((b) => b.checkout_status === 'pending').length;

  return (
    <section className="hub-grooming-drawer__section">
      <div className="hub-grooming-drawer__heading-row">
        <h4 className="hub-grooming-drawer__heading">Pertences</h4>
        {belongings.length ? (
          <span className="hub-grooming-drawer__count">
            {variant === 'checkout' && pendingReturn
              ? `${pendingReturn} a conferir`
              : `${total} ${total === 1 ? 'item' : 'itens'}`}
          </span>
        ) : null}
      </div>
      {belongings.length ? (
        <ul className="hub-grooming-drawer__lines">
          {belongings.map((b) => (
            <li key={b.id} className="hub-grooming-drawer__line hub-boarding-belongings__line">
              <span className="hub-grooming-drawer__line-name">
                {b.quantity > 1 ? `${b.quantity}× ` : ''}
                {b.description}
                <span className="hub-grooming-drawer__line-state"> · {BELONGING_CATEGORY_LABELS[b.category] ?? b.category}</span>
              </span>
              {variant === 'checkout' ? (
                <div className="hub-clientes__btn-row hub-boarding-belongings__checkout">
                  {(['returned', 'missing', 'consumed'] as BoardingBelongingCheckout[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={b.checkout_status === s}
                      disabled={busy}
                      className={`hub-clientes__btn hub-clientes__btn--sm ${b.checkout_status === s ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
                      onClick={() =>
                        void wrap(
                          () =>
                            hubBoardingApi.patchBelonging(b.id, {
                              clinic_id: clinicId,
                              checkout_status: b.checkout_status === s ? 'pending' : s,
                            }),
                          'Erro ao atualizar pertence',
                        )
                      }
                    >
                      {BELONGING_CHECKOUT_LABELS[s]}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {b.checkout_status !== 'pending' ? (
                    <span
                      className={`hub-grooming-drawer__stage hub-grooming-drawer__stage--${CHECKOUT_VARIANT[b.checkout_status]}`}
                    >
                      {BELONGING_CHECKOUT_LABELS[b.checkout_status]}
                    </span>
                  ) : null}
                  {variant === 'manage' ? (
                    <button
                      type="button"
                      className="hub-clientes__icon-btn"
                      disabled={busy}
                      aria-label={`Remover ${b.description}`}
                      onClick={() =>
                        void wrap(() => hubBoardingApi.deleteBelonging(b.id, clinicId), 'Erro ao remover pertence')
                      }
                    >
                      <X size={14} aria-hidden />
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hub-grooming-drawer__hint">Nenhum pertence registrado na entrada.</p>
      )}
      {variant === 'manage' ? (
        <BelongingAddRow
          idPrefix={`belonging-${reservationId}`}
          busy={busy}
          onAdd={(d) =>
            wrap(
              () =>
                hubBoardingApi.createBelonging(reservationId, {
                  clinic_id: clinicId,
                  category: d.category,
                  description: d.description,
                  quantity: d.quantity,
                }),
              'Erro ao adicionar pertence',
            )
          }
        />
      ) : null}
    </section>
  );
};

export default BoardingBelongingsSection;
