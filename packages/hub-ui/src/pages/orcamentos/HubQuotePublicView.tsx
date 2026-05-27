import React, { useMemo } from 'react';
import type { HubQuote, HubQuoteLine } from '../../api/hubQuotesApi';
import {
  clinicDisplayName,
  discountAmount,
  embedOne,
  petLabel,
  publicLineServiceSubtitle,
  publicLineServiceTitle,
  sizeTierLabelPt,
  staffStatusClass,
  staffStatusLabel,
} from './hubQuoteViewUtils';

export type HubQuotePublicAudience = 'public' | 'staff';

export interface HubQuotePublicViewProps {
  quote: HubQuote;
  /** `staff` mostra estado interno, datas de envio e notas internas. */
  audience?: HubQuotePublicAudience;
  /** Conteúdo no topo da página (ex.: barra de ações da equipa). */
  leading?: React.ReactNode;
  /** Conteúdo no fim do documento, antes do rodapé opcional (ex.: converter em cliente). */
  trailing?: React.ReactNode;
}

export const HubQuotePublicView: React.FC<HubQuotePublicViewProps> = ({
  quote,
  audience = 'public',
  leading,
  trailing,
}) => {
  const isStaff = audience === 'staff';
  const prospect = embedOne(quote.prospect);
  const clinicName = clinicDisplayName(quote);
  const pets = useMemo(
    () => [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [quote.pets],
  );
  const lines = useMemo(
    () => [...(quote.lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [quote.lines],
  );

  const disc = discountAmount(quote);
  const currency = quote.currency || 'BRL';
  const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency });

  const expired =
    quote.expires_at &&
    quote.status !== 'accepted' &&
    quote.status !== 'cancelled' &&
    new Date(quote.expires_at).getTime() < Date.now();

  return (
    <div className={`hub-public-quote${isStaff ? ' hub-public-quote--staff' : ''}`}>
      {leading}
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            {clinicName ? (
              <>
                <p className="hub-public-quote__eyebrow">Orçamento</p>
                <h1 className="hub-public-quote__clinic">{clinicName}</h1>
              </>
            ) : (
              <h1 className="hub-public-quote__clinic hub-public-quote__clinic--solo">Orçamento</h1>
            )}
            <p className="hub-public-quote__tagline">Proposta personalizada para o seu pet.</p>
          </div>
          <aside className="hub-public-quote__meta-card" aria-label="Resumo do documento">
            <p className="hub-public-quote__meta-label">Referência</p>
            <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">{quote.id.slice(0, 8).toUpperCase()}</p>
            <p className="hub-public-quote__meta-label">Criado em</p>
            <p className="hub-public-quote__meta-value">
              {quote.created_at ? new Date(quote.created_at).toLocaleString('pt-BR') : '—'}
            </p>
            {isStaff ? (
              <>
                <p className="hub-public-quote__meta-label">Estado (interno)</p>
                <p className="hub-public-quote__meta-value">
                  <span className={staffStatusClass(quote.status)}>{staffStatusLabel(quote.status)}</span>
                </p>
                {quote.sent_at ? (
                  <>
                    <p className="hub-public-quote__meta-label">Enviado em</p>
                    <p className="hub-public-quote__meta-value">{new Date(quote.sent_at).toLocaleString('pt-BR')}</p>
                  </>
                ) : null}
              </>
            ) : null}
            {quote.expires_at ? (
              <>
                <p className="hub-public-quote__meta-label">Válido até</p>
                <p className={`hub-public-quote__meta-value${expired ? ' hub-public-quote__meta-value--warn' : ''}`}>
                  {new Date(quote.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
                </p>
              </>
            ) : null}
          </aside>
        </header>

        {expired ? (
          <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="status">
            <p className="hub-public-quote__banner-text">
              A data de validade deste orçamento já passou. Entre em contacto com a clínica para confirmar valores e disponibilidade.
            </p>
            {isStaff ? (
              <p className="hub-public-quote__banner-text hub-public-quote__banner-text--staff-hint">
                Equipa: use «Duplicar / Renovar» ou reabra como rascunho para ajustar valores antes de voltar a enviar.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="hub-public-quote__grid-2">
          <section className="hub-public-quote__card">
            <h2 className="hub-public-quote__card-title">Dados do contato</h2>
            {prospect ? (
              <dl className="hub-public-quote__dl">
                <dt>Nome</dt>
                <dd>{prospect.full_name}</dd>
                <dt>Telefone</dt>
                <dd>{prospect.phone}</dd>
                {prospect.tax_id ? (
                  <>
                    <dt>CPF</dt>
                    <dd>{prospect.tax_id}</dd>
                  </>
                ) : null}
                {prospect.email ? (
                  <>
                    <dt>E-mail</dt>
                    <dd>{prospect.email}</dd>
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
                    {pets.map((p, i) => (
                      <tr key={p.id}>
                        <td>{petLabel(p, i)}</td>
                        <td>{p.species}</td>
                        <td>{p.breed?.trim() ? p.breed : '—'}</td>
                        <td>{sizeTierLabelPt(p.size_tier)}</td>
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
                  {pets.map((p, i) => (
                    <th key={p.id} className="right hub-public-quote__th-pet">
                      <span className="hub-public-quote__th-pet-name">{petLabel(p, i)}</span>
                      <span className="hub-public-quote__th-pet-sub">Valor</span>
                    </th>
                  ))}
                  <th className="right">Total linha</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(2, 2 + pets.length)}
                      className="hub-public-quote__muted hub-public-quote__td-empty"
                    >
                      Sem linhas de serviço.
                    </td>
                  </tr>
                ) : (
                  lines.map((ln: HubQuoteLine) => {
                    const sub = publicLineServiceSubtitle(ln);
                    return (
                      <tr key={ln.id}>
                        <td>
                          <span className="hub-public-quote__svc-title">{publicLineServiceTitle(ln)}</span>
                          {sub ? <span className="hub-public-quote__svc-sub">{sub}</span> : null}
                        </td>
                        {pets.map((p) => {
                          const lp = (ln.line_pets ?? []).find((x) => x.quote_pet_id === p.id);
                          return (
                            <td key={p.id} className="right">
                              {lp ? brl(Number(lp.unit_price)) : '—'}
                            </td>
                          );
                        })}
                        <td className="right">
                          <strong>{brl(Number(ln.line_total))}</strong>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {quote.client_notes ? (
          <section className="hub-public-quote__card hub-public-quote__card--notes">
            <h2 className="hub-public-quote__card-title">Mensagem da clínica</h2>
            <p className="hub-public-quote__notes-body">{quote.client_notes}</p>
          </section>
        ) : null}

        {isStaff && quote.notes?.trim() ? (
          <section className="hub-public-quote__card hub-public-quote__card--notes hub-public-quote__card--internal">
            <h2 className="hub-public-quote__card-title">Notas internas</h2>
            <p className="hub-public-quote__notes-body hub-public-quote__notes-body--pre">{quote.notes.trim()}</p>
          </section>
        ) : null}

        <footer className="hub-public-quote__totals">
          <div className="hub-public-quote__totals-row">
            <span>Subtotal</span>
            <span>{brl(Number(quote.subtotal_amount ?? 0))}</span>
          </div>
          {disc > 0 ? (
            <div className="hub-public-quote__totals-row hub-public-quote__totals-row--discount">
              <span>
                {quote.discount_kind === 'percent'
                  ? `Desconto (${Math.min(100, Math.max(0, Number(quote.discount_value ?? 0)))}%)`
                  : 'Desconto'}
              </span>
              <span>−{brl(disc)}</span>
            </div>
          ) : null}
          <div className="hub-public-quote__totals-row hub-public-quote__totals-row--grand">
            <span>Total</span>
            <span>{brl(Number(quote.total_amount))}</span>
          </div>
        </footer>

        {isStaff ? (
          <p className="hub-public-quote__fineprint hub-public-quote__fineprint--staff">
            Vista da equipa: o link público segue o mesmo layout de proposta, sem as notas internas acima.
          </p>
        ) : (
          <p className="hub-public-quote__fineprint">
            Valores e horários dependem da disponibilidade da clínica. Este documento é uma proposta; não cria reserva nem cadastro automático.
          </p>
        )}
        {trailing}
      </div>
    </div>
  );
};

export default HubQuotePublicView;
