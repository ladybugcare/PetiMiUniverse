import React, { useMemo } from 'react';
import { Calendar, ClipboardList, CreditCard, FileText, Mail, Phone, User } from 'lucide-react';
import type { HubPublicChargeBundleResponse } from '../../api/hubFinancialApi';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import {
  PublicDocCardTitle,
  PublicDocFieldLabel,
  PublicDocHeaderLogo,
  PublicDocMetaRow,
} from '../orcamentos/hubPublicDocumentUi';

export type HubChargeBundlePublicPayload = HubPublicChargeBundleResponse;

function formatDueDatePt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface HubChargeBundlePublicViewProps {
  payload: HubChargeBundlePublicPayload;
}

export const HubChargeBundlePublicView: React.FC<HubChargeBundlePublicViewProps> = ({ payload }) => {
  const bundle = payload.bundle;
  const guardian = bundle.guardian;
  const clinicName = bundle.clinic?.name?.trim() || 'Clínica';
  const clinicLogoUrl = bundle.clinic?.photo_url?.trim() || null;
  const items = useMemo(() => [...(bundle.items ?? [])], [bundle.items]);

  const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const refShort = String(bundle.id ?? '').slice(0, 8).toUpperCase();
  const balanceDue = Number(bundle.balance_due ?? 0);
  const totalAmount = Number(bundle.total_amount ?? 0);

  return (
    <div className="hub-public-quote">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <PublicDocHeaderLogo logoUrl={clinicLogoUrl} clinicName={clinicName} />
            <div>
              <p className="hub-public-quote__eyebrow">Cobrança agrupada</p>
              <h1 className="hub-public-quote__clinic">{clinicName}</h1>
              <p className="hub-public-quote__tagline">Resumo consolidado das cobranças em aberto.</p>
            </div>
          </div>
          <aside className="hub-public-quote__meta-card" aria-label="Resumo do documento">
            <PublicDocMetaRow icon={FileText} label="Referência">
              <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">{refShort}</p>
            </PublicDocMetaRow>
            <PublicDocMetaRow icon={ClipboardList} label="Itens">
              <p className="hub-public-quote__meta-value">{String(items.length)}</p>
            </PublicDocMetaRow>
            <PublicDocMetaRow icon={Calendar} label="Vencimento">
              <p className="hub-public-quote__meta-value">{formatDueDatePt(bundle.due_date)}</p>
            </PublicDocMetaRow>
          </aside>
        </header>

        {guardian ? (
          <section className="hub-public-quote__card">
            <PublicDocCardTitle icon={User}>Dados do contato</PublicDocCardTitle>
            <dl className="hub-public-quote__dl">
              <PublicDocFieldLabel icon={User}>Nome</PublicDocFieldLabel>
              <dd>{guardian.full_name || '—'}</dd>
              {guardian.phone ? (
                <>
                  <PublicDocFieldLabel icon={Phone}>Telefone</PublicDocFieldLabel>
                  <dd>{formatBrPhoneDisplay(guardian.phone)}</dd>
                </>
              ) : null}
              {guardian.email ? (
                <>
                  <PublicDocFieldLabel icon={Mail}>E-mail</PublicDocFieldLabel>
                  <dd>{guardian.email}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        <section className="hub-public-quote__card">
          <PublicDocCardTitle icon={ClipboardList}>Itens do lote</PublicDocCardTitle>
          <div className="hub-public-quote__table-scroll">
            <table className="hub-public-quote__table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Pet(s)</th>
                  <th>Vencimento</th>
                  <th className="right">Valor</th>
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
                    <tr key={it.receivable_id}>
                      <td>
                        <span className="hub-public-quote__svc-title">{it.title}</span>
                      </td>
                      <td>{it.pet_names?.length ? it.pet_names.join(', ') : '—'}</td>
                      <td>{formatDueDatePt(it.due_date)}</td>
                      <td className="right">
                        <strong>{brl(it.balance_amount)}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {bundle.notes?.trim() ? (
          <section className="hub-public-quote__card hub-public-quote__card--notes">
            <PublicDocCardTitle icon={CreditCard}>Observações</PublicDocCardTitle>
            <p className="hub-public-quote__notes-body">{bundle.notes.trim()}</p>
          </section>
        ) : null}

        <footer className="hub-public-quote__totals">
          <div className="hub-public-quote__totals-row hub-public-quote__totals-row--grand">
            <span>Total do lote</span>
            <span>{brl(totalAmount)}</span>
          </div>
          {balanceDue > 0.009 ? (
            <div className="hub-public-quote__totals-row hub-public-quote__totals-row--warn">
              <span>Saldo em aberto</span>
              <span>{brl(balanceDue)}</span>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
};

export default HubChargeBundlePublicView;
