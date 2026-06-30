import React, { useMemo } from 'react';
import type { HubComandaItem, HubPublicComandaPet } from '../../api/hubComandaApi';
import { sizeTierLabelPt } from '../orcamentos/hubQuoteViewUtils';

export type HubComandaPublicPayload = {
  comanda: Record<string, unknown> & {
    clinic?: { name: string | null } | null;
    guardian?: {
      full_name?: string;
      phone?: string | null;
      email?: string | null;
      tax_id?: string | null;
    } | null;
  };
  items: HubComandaItem[];
  pets?: HubPublicComandaPet[];
  paid_total?: number;
  balance_due?: number;
};

function statusLabelPt(status: string): string {
  const m: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' };
  return m[status] ?? status;
}

function derivePetsFromItems(items: HubComandaItem[]): HubPublicComandaPet[] {
  const byId = new Map<string, HubPublicComandaPet>();
  for (const it of items) {
    if (!it.pet_id || !it.pet_name) continue;
    if (!byId.has(it.pet_id)) {
      byId.set(it.pet_id, {
        id: it.pet_id,
        name: it.pet_name,
        species: '—',
        breed: null,
        size_tier: '',
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export interface HubComandaPublicViewProps {
  payload: HubComandaPublicPayload;
}

export const HubComandaPublicView: React.FC<HubComandaPublicViewProps> = ({ payload }) => {
  const comanda = payload.comanda;
  const guardian = comanda.guardian;
  const clinicName = comanda.clinic?.name?.trim() || 'Clínica';
  const items = useMemo(
    () => [...(payload.items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [payload.items],
  );
  const pets = useMemo(() => {
    const fromApi = payload.pets ?? [];
    if (fromApi.length > 0) return fromApi;
    return derivePetsFromItems(items);
  }, [payload.pets, items]);

  const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const refShort = String(comanda.id ?? '').slice(0, 8).toUpperCase();
  const balanceDue = Number(payload.balance_due ?? 0);
  const paidTotal = Number(payload.paid_total ?? 0);
  const hasPending = balanceDue > 0.009;

  return (
    <div className="hub-public-quote">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <p className="hub-public-quote__eyebrow">Comanda</p>
            <h1 className="hub-public-quote__clinic">{clinicName}</h1>
            <p className="hub-public-quote__tagline">Resumo de serviços e valores.</p>
          </div>
          <aside className="hub-public-quote__meta-card" aria-label="Resumo do documento">
            <p className="hub-public-quote__meta-label">Referência</p>
            <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">{refShort}</p>
            <p className="hub-public-quote__meta-label">Aberta em</p>
            <p className="hub-public-quote__meta-value">
              {comanda.opened_at ? new Date(String(comanda.opened_at)).toLocaleString('pt-BR') : '—'}
            </p>
            <p className="hub-public-quote__meta-label">Status</p>
            <p className="hub-public-quote__meta-value">{statusLabelPt(String(comanda.status ?? ''))}</p>
          </aside>
        </header>

        <div className="hub-public-quote__grid-2">
          <section className="hub-public-quote__card">
            <h2 className="hub-public-quote__card-title">Dados do contato</h2>
            {guardian?.full_name ? (
              <dl className="hub-public-quote__dl">
                <dt>Nome</dt>
                <dd>{guardian.full_name}</dd>
                <dt>Telefone</dt>
                <dd>{guardian.phone?.trim() || '—'}</dd>
                {guardian.tax_id ? (
                  <>
                    <dt>CPF</dt>
                    <dd>{guardian.tax_id}</dd>
                  </>
                ) : null}
                {guardian.email ? (
                  <>
                    <dt>E-mail</dt>
                    <dd>{guardian.email}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="hub-public-quote__muted">—</p>
            )}
          </section>

          <section className="hub-public-quote__card">
            <h2 className="hub-public-quote__card-title">Pets</h2>
            {pets.length === 0 ? (
              <p className="hub-public-quote__muted">—</p>
            ) : (
              <div className="hub-public-quote__table-scroll">
                <table className="hub-public-quote__data-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Espécie</th>
                      <th>Raça</th>
                      <th>Porte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pets.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.species || '—'}</td>
                        <td>{p.breed?.trim() ? p.breed : '—'}</td>
                        <td>{p.size_tier ? sizeTierLabelPt(p.size_tier) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="hub-public-quote__card hub-public-quote__card--flush">
          <h2 className="hub-public-quote__card-title">Serviços e valores</h2>
          <div className="hub-public-quote__table-scroll">
            <table className="hub-orcamento-novo__services-table hub-public-quote__services-table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Pet</th>
                  <th className="right">Qtd</th>
                  <th className="right">Total linha</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="hub-public-quote__muted hub-public-quote__td-empty">
                      Sem itens.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <span className="hub-public-quote__svc-title">{it.description}</span>
                      </td>
                      <td>{it.pet_name ?? '—'}</td>
                      <td className="right">{it.quantity}</td>
                      <td className="right">
                        <strong>{brl(Number(it.line_total))}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="hub-public-quote__totals">
          <div className="hub-public-quote__totals-row">
            <span>Subtotal</span>
            <span>{brl(Number(comanda.subtotal_amount ?? 0))}</span>
          </div>
          {Number(comanda.discount_amount ?? 0) > 0 ? (
            <div className="hub-public-quote__totals-row hub-public-quote__totals-row--discount">
              <span>Desconto</span>
              <span>−{brl(Number(comanda.discount_amount))}</span>
            </div>
          ) : null}
          <div className="hub-public-quote__totals-row hub-public-quote__totals-row--grand">
            <span>Total</span>
            <span>{brl(Number(comanda.total_amount ?? 0))}</span>
          </div>
          {paidTotal > 0.009 ? (
            <div className="hub-public-quote__totals-row hub-public-quote__totals-row--muted">
              <span>Pago</span>
              <span>{brl(paidTotal)}</span>
            </div>
          ) : null}
          {hasPending ? (
            <div className="hub-public-quote__totals-row hub-public-quote__totals-row--warn">
              <span>Pendente</span>
              <span>{brl(balanceDue)}</span>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
};

export default HubComandaPublicView;
