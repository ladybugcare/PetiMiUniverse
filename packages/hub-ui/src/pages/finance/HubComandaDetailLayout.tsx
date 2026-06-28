import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { HubComandaAllowedGuardian, HubComandaGuardianEmbed } from '../../api/hubComandaApi';
import { waMeBaseUrl } from './hubComandaShareUtils';
import {
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  DollarSign,
  FileDown,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Share2,
  User,
} from 'lucide-react';

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusClass(status: string): string {
  if (status === 'aberta') return 'hub-quote-detail__status hub-quote-detail__status--sent';
  if (status === 'fechada') return 'hub-quote-detail__status hub-quote-detail__status--accepted';
  if (status === 'cancelada') return 'hub-quote-detail__status hub-quote-detail__status--cancelled';
  return 'hub-quote-detail__status';
}

function statusLabel(status: string): string {
  const m: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' };
  return m[status] ?? status;
}

export interface HubComandaDetailLayoutProps {
  comandaId: string;
  status: string;
  openedAt?: string | null;
  closedAt?: string | null;
  guardian: HubComandaGuardianEmbed | null;
  allowedGuardians: HubComandaAllowedGuardian[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paidTotal?: number;
  balanceDue?: number;
  canWrite: boolean;
  canEdit?: boolean;
  saving: boolean;
  isAberta: boolean;
  mode?: 'caixa' | 'financeiro';
  readOnlyBanner?: React.ReactNode;
  selectedGuardianId: string | null;
  onGuardianChange?: (guardianId: string) => void;
  onSave?: () => void;
  onCheckout?: () => void;
  onSendToFinancial?: () => void;
  onOpenPdf: () => void;
  onCopyPublic: () => void;
  onShareOpenPublic: () => void;
  onShareWhatsAppWithMessage: () => void;
  itemsSection: React.ReactNode;
  notesSection: React.ReactNode;
  sidebarActions?: React.ReactNode;
  financePanel?: React.ReactNode;
}

export const HubComandaDetailLayout: React.FC<HubComandaDetailLayoutProps> = ({
  comandaId,
  status,
  openedAt,
  closedAt,
  guardian,
  allowedGuardians,
  subtotal,
  discountAmount,
  total,
  paidTotal = 0,
  balanceDue = 0,
  canWrite,
  canEdit: canEditProp,
  saving,
  isAberta,
  mode = 'caixa',
  readOnlyBanner,
  selectedGuardianId,
  onGuardianChange,
  onSave,
  onCheckout,
  onSendToFinancial,
  onOpenPdf,
  onCopyPublic,
  onShareOpenPublic,
  onShareWhatsAppWithMessage,
  itemsSection,
  notesSection,
  sidebarActions,
  financePanel,
}) => {
  const canEdit = canEditProp ?? (isAberta && canWrite);
  const refShort = comandaId.slice(0, 8).toUpperCase();
  const wa = guardian?.phone ? waMeBaseUrl(guardian.phone) : null;
  const telHref = guardian?.phone ? `tel:${guardian.phone.replace(/\D/g, '')}` : null;
  const shareWhatsAppEnabled = Boolean(guardian?.phone && waMeBaseUrl(guardian.phone));

  const closeShareDetails = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.closest('details')?.removeAttribute('open');
  };

  const timeline = useMemo(() => {
    type V = 'done' | 'active' | 'todo';
    const items: { title: string; sub?: string; variant: V }[] = [
      {
        title: 'Comanda aberta',
        sub: openedAt ? new Date(openedAt).toLocaleString('pt-BR') : undefined,
        variant: 'done',
      },
    ];
    if (paidTotal > 0) {
      items.push({
        title: 'Pagamento registrado',
        sub: fmtBrl(paidTotal),
        variant: 'done',
      });
    }
    if (balanceDue > 0.009 && status !== 'cancelada') {
      items.push({
        title: 'Saldo pendente',
        sub: fmtBrl(balanceDue),
        variant: status === 'aberta' ? 'active' : 'todo',
      });
    }
    if (status === 'fechada' && closedAt) {
      items.push({ title: 'Comanda fechada', sub: new Date(closedAt).toLocaleString('pt-BR'), variant: 'done' });
    }
    if (status === 'cancelada') {
      items.push({ title: 'Comanda cancelada', variant: 'active' });
    }
    return items;
  }, [openedAt, closedAt, paidTotal, balanceDue, status]);

  const metaParts: string[] = [];
  if (openedAt) metaParts.push(`Aberta em ${new Date(openedAt).toLocaleString('pt-BR')}`);
  if (closedAt && status === 'fechada') {
    metaParts.push(`Fechada em ${new Date(closedAt).toLocaleString('pt-BR')}`);
  }

  const canChangeGuardian =
    canEdit && allowedGuardians.length > 1 && onGuardianChange && selectedGuardianId;

  const crumbBase = mode === 'financeiro' ? { label: 'Financeiro', to: '/hub/financeiro' } : { label: 'Caixa', to: '/hub/caixa' };
  const readyToSendPath =
    mode === 'financeiro'
      ? `/hub/financeiro/comanda/${comandaId}/pronto-para-envio`
      : `/hub/caixa/comanda/${comandaId}/pronto-para-envio`;

  return (
    <div className="hub-quote-detail">
      <div className={`hub-quote-detail__inner${financePanel ? ' hub-quote-detail__inner--with-finance' : ''}`}>
        <nav className="hub-quote-detail__crumb" aria-label="Navegação">
          <Link to={crumbBase.to}>{crumbBase.label}</Link>
          <ChevronRight size={14} aria-hidden />
          <span className="hub-quote-detail__crumb-current">#{refShort}</span>
        </nav>

        {readOnlyBanner ? (
          <div className="hub-quote-detail__banner" role="status">
            {readOnlyBanner}
          </div>
        ) : null}

        <header className="hub-quote-detail__hero">
          <div className="hub-quote-detail__hero-main">
            <div className="hub-quote-detail__title-row">
              <h1 className="hub-quote-detail__title">Comanda #{refShort}</h1>
              <span className={statusClass(status)}>{statusLabel(status)}</span>
            </div>
            {metaParts.length > 0 ? <p className="hub-quote-detail__meta-line">{metaParts.join(' · ')}</p> : null}
          </div>
          <div className="hub-quote-detail__hero-actions">
            {mode === 'caixa' && canEdit && onCheckout ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--primary"
                disabled={saving}
                onClick={onCheckout}
              >
                <Coins size={18} strokeWidth={2} aria-hidden />
                Cobrar
              </button>
            ) : null}
            {mode === 'financeiro' && canEdit && onCheckout && balanceDue > 0.009 ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--primary"
                disabled={saving}
                onClick={onCheckout}
              >
                <Coins size={18} strokeWidth={2} aria-hidden />
                Cobrar
              </button>
            ) : null}
            {canEdit && onSave ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onSave}
              >
                Salvar
              </button>
            ) : null}
            <button
              type="button"
              className="hub-quote-detail__btn hub-quote-detail__btn--outline"
              disabled={saving}
              onClick={onOpenPdf}
              title="PDF"
            >
              <FileDown size={18} strokeWidth={2} aria-hidden />
              <span className="hub-quote-detail__btn-text">PDF</span>
            </button>
            <details className="hub-quote-detail__more hub-quote-detail__share-wrap">
              <summary
                className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-quote-detail__more-summary"
                aria-label="Compartilhar comanda"
              >
                <Share2 size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Compartilhar</span>
              </summary>
              <div className="hub-quote-detail__more-panel">
                <Link
                  to={readyToSendPath}
                  className="hub-quote-detail__more-item"
                  onClick={closeShareDetails}
                >
                  Ver mensagem pronta para envio
                </Link>
                <button
                  type="button"
                  className="hub-quote-detail__more-item"
                  disabled={saving}
                  onClick={(e) => {
                    void onCopyPublic();
                    closeShareDetails(e);
                  }}
                >
                  Copiar link público
                </button>
                <button
                  type="button"
                  className="hub-quote-detail__more-item"
                  disabled={saving}
                  onClick={(e) => {
                    void onShareOpenPublic();
                    closeShareDetails(e);
                  }}
                >
                  Abrir comanda pública
                </button>
                <button
                  type="button"
                  className="hub-quote-detail__more-item"
                  disabled={saving}
                  onClick={(e) => {
                    onOpenPdf();
                    closeShareDetails(e);
                  }}
                >
                  Baixar ou abrir PDF
                </button>
                <button
                  type="button"
                  className="hub-quote-detail__more-item"
                  disabled={saving || !shareWhatsAppEnabled}
                  title={!shareWhatsAppEnabled ? 'Cadastre um telefone válido no tutor' : undefined}
                  onClick={(e) => {
                    void onShareWhatsAppWithMessage();
                    closeShareDetails(e);
                  }}
                >
                  WhatsApp com mensagem
                </button>
              </div>
            </details>
          </div>
        </header>

        <div className="hub-quote-detail__grid">
          <div className="hub-quote-detail__main">
            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <User size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Cliente</h2>
              </div>
              {guardian ? (
                <div className="hub-quote-detail__contact-grid">
                  {canChangeGuardian ? (
                    <div className="hub-quote-detail__field hub-quote-detail__field--wide">
                      <span className="hub-quote-detail__field-label">Cobrança para</span>
                      <select
                        className="hub-orcamento-novo__input"
                        value={selectedGuardianId ?? guardian.id}
                        disabled={saving}
                        onChange={(e) => onGuardianChange!(e.target.value)}
                      >
                        {allowedGuardians.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.full_name}
                            {g.role === 'secondary' ? ' (co-tutor)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="hub-quote-detail__field">
                      <span className="hub-quote-detail__field-label">Nome</span>
                      <span className="hub-quote-detail__field-value">{guardian.full_name}</span>
                    </div>
                  )}
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">Telefone</span>
                    <span className="hub-quote-detail__field-value hub-quote-detail__field-value--row">
                      <Phone size={16} aria-hidden />
                      {telHref && guardian.phone ? (
                        <a href={telHref} className="hub-quote-detail__link">
                          {guardian.phone}
                        </a>
                      ) : (
                        guardian.phone ?? '—'
                      )}
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="hub-quote-detail__ic-link" title="WhatsApp">
                          <MessageCircle size={18} />
                        </a>
                      ) : null}
                    </span>
                  </div>
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">E-mail</span>
                    <span className="hub-quote-detail__field-value hub-quote-detail__field-value--row">
                      <Mail size={16} aria-hidden />
                      {guardian.email ? (
                        <a href={`mailto:${guardian.email}`} className="hub-quote-detail__link">
                          {guardian.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="hub-quote-detail__muted">—</p>
              )}
            </section>

            <section className="hub-quote-detail__card hub-quote-detail__card--flush">
              <div className="hub-quote-detail__card-head hub-quote-detail__card-head--spread">
                <div className="hub-quote-detail__card-head-left">
                  <ClipboardList size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                  <h2 className="hub-quote-detail__card-title">Itens da comanda</h2>
                </div>
              </div>
              {itemsSection}
            </section>

            {notesSection}
          </div>

          <aside className="hub-quote-detail__aside">
            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <DollarSign size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Resumo financeiro</h2>
              </div>
              <div className="hub-quote-detail__money-rows">
                <div className="hub-quote-detail__money-row">
                  <span>Subtotal</span>
                  <span>{fmtBrl(subtotal)}</span>
                </div>
                {discountAmount > 0 ? (
                  <div className="hub-quote-detail__money-row hub-quote-detail__money-row--discount">
                    <span>Desconto</span>
                    <span>−{fmtBrl(discountAmount)}</span>
                  </div>
                ) : null}
                <div className="hub-quote-detail__money-row hub-quote-detail__money-row--total">
                  <span>Total</span>
                  <span>{fmtBrl(total)}</span>
                </div>
                {paidTotal > 0 ? (
                  <div className="hub-quote-detail__money-row">
                    <span>Pago</span>
                    <span>{fmtBrl(paidTotal)}</span>
                  </div>
                ) : null}
                {balanceDue > 0.009 ? (
                  <div className="hub-quote-detail__money-row">
                    <span>Pendente</span>
                    <span>{fmtBrl(balanceDue)}</span>
                  </div>
                ) : null}
              </div>
            </section>

            {sidebarActions}

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <Clock size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Timeline</h2>
              </div>
              <ol className="hub-quote-detail__timeline">
                {timeline.map((step, idx) => (
                  <li
                    key={`${step.title}-${idx}`}
                    className={`hub-quote-detail__timeline-item hub-quote-detail__timeline-item--${step.variant}`}
                  >
                    <span className="hub-quote-detail__timeline-dot" aria-hidden />
                    <div>
                      <div className="hub-quote-detail__timeline-title">{step.title}</div>
                      {step.sub ? <div className="hub-quote-detail__timeline-sub">{step.sub}</div> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {mode === 'caixa' && canEdit && onSendToFinancial ? (
              <section className="hub-quote-detail__card">
                <button
                  type="button"
                  className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-quote-detail__btn--block"
                  disabled={saving}
                  onClick={onSendToFinancial}
                >
                  <Send size={18} strokeWidth={2} aria-hidden />
                  Enviar ao financeiro
                </button>
              </section>
            ) : null}
          </aside>
        </div>
        {financePanel ? (
          <aside className="hub-quote-detail__finance-panel hub-clientes__panel hub-finance-page__panel" aria-label="Cobrança">
            {financePanel}
          </aside>
        ) : null}
      </div>
    </div>
  );
};

export default HubComandaDetailLayout;
