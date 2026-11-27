import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type {
  HubComandaAllowedGuardian,
  HubComandaEvent,
  HubComandaGuardianEmbed,
  HubComandaPetEmbed,
  HubComandaTimelinePayment,
} from '../../api/hubComandaApi';
import { buildComandaTimelineSteps } from './hubComandaTimeline';
import { sexLabelPt, sizeTierLabelPt } from '../orcamentos/hubQuoteViewUtils';
import { DocumentContactStrip, DocumentPetStrip, DocumentPetStripList } from '../orcamentos/hubDocumentPartyCards';
import { waMeBaseUrl } from './hubComandaShareUtils';
import {
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  DollarSign,
  FileDown,
  Printer,
  Send,
  Share2,
  User,
  Dog,
} from 'lucide-react';
import {
  CARD_FEE_PARTIAL_COVERAGE_HINT,
  cardFeeTotalCentsPositive,
} from '../../utils/hubCardMachineFees';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';

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
  pets: HubComandaPetEmbed[];
  allowedGuardians: HubComandaAllowedGuardian[];
  subtotal: number;
  discountAmount: number;
  total: number;
  /** Líquido vigente após devoluções (quando distinto do total bruto). */
  netTotal?: number;
  returnedAmount?: number;
  paidTotal?: number;
  balanceDue?: number;
  cardFeeTotal?: number;
  cardNetTotal?: number;
  cardWithoutFeeGrossTotal?: number;
  events?: HubComandaEvent[];
  payments?: HubComandaTimelinePayment[];
  canWrite: boolean;
  canEdit?: boolean;
  saving: boolean;
  isAberta: boolean;
  /** false = origem operacional ainda em andamento (ex.: consulta clínica não finalizada). */
  operationalComplete?: boolean;
  /** Deep link para finalizar/avançar a origem no módulo operacional. */
  operationalHref?: string | null;
  /** Bloqueio de handoff (ex.: COMMISSION_EXECUTOR_REQUIRED). */
  handoffBlockCode?: string | null;
  /** Abre MarkExecutionModal no detalhe (quando a origem exige executor). */
  onMarkExecution?: () => void;
  mode?: 'caixa' | 'financeiro';
  readOnlyBanner?: React.ReactNode;
  selectedGuardianId: string | null;
  onGuardianChange?: (guardianId: string) => void;
  onSave?: () => void;
  onCheckout?: () => void;
  checkoutLabel?: string;
  onSendToFinancial?: () => void;
  onOpenPdf: () => void;
  onOpenCupom?: () => void;
  onCopyPublic: () => void;
  onShareOpenPublic: () => void;
  onShareWhatsAppWithMessage: () => void;
  itemsSection: React.ReactNode;
  notesSection: React.ReactNode;
  sidebarActions?: React.ReactNode;
}

export const HubComandaDetailLayout: React.FC<HubComandaDetailLayoutProps> = ({
  comandaId,
  status,
  openedAt,
  closedAt,
  guardian,
  pets,
  allowedGuardians,
  subtotal,
  discountAmount,
  total,
  netTotal,
  returnedAmount = 0,
  paidTotal = 0,
  balanceDue = 0,
  cardFeeTotal = 0,
  cardNetTotal = 0,
  cardWithoutFeeGrossTotal = 0,
  events = [],
  payments = [],
  canWrite,
  canEdit: canEditProp,
  saving,
  isAberta,
  operationalComplete = true,
  operationalHref = null,
  handoffBlockCode = null,
  onMarkExecution,
  mode = 'caixa',
  readOnlyBanner,
  selectedGuardianId,
  onGuardianChange,
  onSave,
  onCheckout,
  checkoutLabel = 'Cobrar',
  onSendToFinancial,
  onOpenPdf,
  onOpenCupom,
  onCopyPublic,
  onShareOpenPublic,
  onShareWhatsAppWithMessage,
  itemsSection,
  notesSection,
  sidebarActions,
}) => {
  const canEdit = canEditProp ?? (isAberta && canWrite);
  const refShort = comandaId.slice(0, 8).toUpperCase();
  const wa = guardian?.phone ? waMeBaseUrl(guardian.phone) : null;
  const telHref = guardian?.phone ? `tel:${guardian.phone.replace(/\D/g, '')}` : null;
  const shareWhatsAppEnabled = Boolean(guardian?.phone && waMeBaseUrl(guardian.phone));

  const closeShareDetails = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.closest('details')?.removeAttribute('open');
  };

  const timeline = useMemo(
    () =>
      buildComandaTimelineSteps({
        openedAt,
        closedAt,
        status,
        paidTotal,
        balanceDue,
        events,
        payments,
      }),
    [openedAt, closedAt, status, paidTotal, balanceDue, events, payments],
  );

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

  const showStickyActions = Boolean(onCheckout || (canEdit && onSave) || (canEdit && onSendToFinancial));

  return (
    <div
      className={`hub-quote-detail hub-quote-detail--comanda${
        showStickyActions ? ' hub-quote-detail--comanda-has-sticky' : ''
      }`}
    >
      <div className="hub-quote-detail__inner">
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

        {isAberta && operationalComplete === false ? (
          <div className="hub-quote-detail__banner" role="status">
            Atendimento ainda não finalizado — novos itens do operacional podem entrar nesta comanda.
            Prefira cobrar ou enviar ao financeiro depois da conclusão.
            {operationalHref ? (
              <>
                {' '}
                <Link to={operationalHref} className="hub-clientes__link">
                  Abrir operação
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {isAberta && operationalComplete !== false && handoffBlockCode === 'COMMISSION_EXECUTOR_REQUIRED' ? (
          <div className="hub-quote-detail__banner" role="status">
            Falta marcar a execução do serviço (executor) antes de cobrar ou enviar ao financeiro.
            {onMarkExecution ? (
              <>
                {' '}
                <button
                  type="button"
                  className="hub-clientes__link"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                  onClick={onMarkExecution}
                >
                  Marcar execução
                </button>
              </>
            ) : (
              <> Use «Marcar execução» no painel do caixa.</>
            )}
          </div>
        ) : null}

        <header className="hub-quote-detail__hero">
          <div className="hub-quote-detail__hero-main">
            <div className="hub-quote-detail__title-row">
              <h1 className="hub-quote-detail__title">Comanda #{refShort}</h1>
              <span className={statusClass(status)}>{statusLabel(status)}</span>
              {isAberta && operationalComplete === false ? (
                <span className="hub-clientes__pill hub-finance-page__pill--warning">
                  Atendimento em andamento
                </span>
              ) : null}
            </div>
            {metaParts.length > 0 ? <p className="hub-quote-detail__meta-line">{metaParts.join(' · ')}</p> : null}
          </div>
          <div className="hub-quote-detail__hero-actions">
            {onCheckout ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--primary hub-comanda-hero__checkout"
                disabled={saving}
                onClick={onCheckout}
              >
                <Coins size={18} strokeWidth={2} aria-hidden />
                {checkoutLabel}
              </button>
            ) : null}
            {mode === 'caixa' && canEdit && onSendToFinancial ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onSendToFinancial}
              >
                <Send size={18} strokeWidth={2} aria-hidden />
                Enviar ao financeiro
              </button>
            ) : null}
            {canEdit && onSave ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-comanda-hero__save"
                disabled={saving}
                onClick={onSave}
              >
                Salvar
              </button>
            ) : null}
            <button
              type="button"
              className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-comanda-hero__secondary"
              disabled={saving}
              onClick={onOpenPdf}
              title="PDF"
            >
              <FileDown size={18} strokeWidth={2} aria-hidden />
              <span className="hub-quote-detail__btn-text">PDF</span>
            </button>
            {onOpenCupom ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-comanda-hero__secondary"
                disabled={saving}
                onClick={onOpenCupom}
                title="Imprimir cupom térmico"
              >
                <Printer size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Cupom</span>
              </button>
            ) : null}
            <details className="hub-quote-detail__more hub-quote-detail__share-wrap hub-comanda-hero__more">
              <summary
                className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-quote-detail__more-summary"
                aria-label="Mais ações da comanda"
              >
                <Share2 size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text hub-comanda-hero__more-label-full">Compartilhar</span>
                <span className="hub-quote-detail__btn-text hub-comanda-hero__more-label-short">Mais</span>
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
                {onOpenCupom ? (
                  <button
                    type="button"
                    className="hub-quote-detail__more-item"
                    disabled={saving}
                    onClick={(e) => {
                      onOpenCupom();
                      closeShareDetails(e);
                    }}
                  >
                    Imprimir cupom térmico
                  </button>
                ) : null}
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
                <span className="hub-quote-detail__card-ic-wrap" aria-hidden>
                  <User size={18} strokeWidth={1.75} className="hub-quote-detail__card-ic" />
                </span>
                <h2 className="hub-quote-detail__card-title">Cliente</h2>
              </div>
              {guardian ? (
                <DocumentContactStrip
                  name={guardian.full_name}
                  phone={guardian.phone}
                  email={guardian.email}
                  telHref={telHref}
                  waHref={wa}
                  leading={
                    canChangeGuardian ? (
                      <div className="hub-quote-detail__field hub-quote-detail__field--wide" style={{ marginBottom: 12 }}>
                        <span className="hub-quote-detail__field-label">Cobrança para</span>
                        <HubSearchableCombobox
                          id="comanda-billing-guardian"
                          className="hub-combobox--clientes"
                          options={allowedGuardians.map((g) => ({
                            value: g.id,
                            label: g.role === 'secondary' ? `${g.full_name} (co-tutor)` : g.full_name,
                          }))}
                          value={selectedGuardianId ?? guardian.id}
                          onChange={(v) => onGuardianChange!(v)}
                          disabled={saving}
                          clearable={false}
                          ariaLabel="Cobrança para"
                        />
                      </div>
                    ) : null
                  }
                />
              ) : (
                <p className="hub-quote-detail__muted">—</p>
              )}
            </section>

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <span className="hub-quote-detail__card-ic-wrap" aria-hidden>
                  <Dog size={18} strokeWidth={1.75} className="hub-quote-detail__card-ic" />
                </span>
                <h2 className="hub-quote-detail__card-title">
                  {pets.length === 1 ? 'Pet' : `Pets${pets.length > 0 ? ` (${pets.length})` : ''}`}
                </h2>
              </div>
              {pets.length === 0 ? (
                <p className="hub-quote-detail__muted">—</p>
              ) : (
                <DocumentPetStripList>
                  {pets.map((p) => (
                    <DocumentPetStrip
                      key={p.id}
                      name={
                        <Link to={`/hub/pets/${p.id}`} className="hub-quote-detail__link">
                          {p.name}
                        </Link>
                      }
                      species={p.species?.trim() || '—'}
                      breed={p.breed?.trim() || '—'}
                      sizeTier={p.size_tier ? sizeTierLabelPt(p.size_tier) : '—'}
                      sex={sexLabelPt(p.sex ?? null)}
                    />
                  ))}
                </DocumentPetStripList>
              )}
            </section>

            <section className="hub-quote-detail__card hub-quote-detail__card--flush">
              <div className="hub-quote-detail__card-head hub-quote-detail__card-head--spread">
                <div className="hub-quote-detail__card-head-left">
                  <ClipboardList size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                  <div>
                    <h2 className="hub-quote-detail__card-title">Serviços e produtos</h2>
                    <p className="hub-orcamento-novo__card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
                      Serviços do atendimento e produtos de estoque vinculados a esta cobrança.
                    </p>
                  </div>
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
                <div
                  className={`hub-quote-detail__money-row${
                    returnedAmount > 0.009 ? '' : ' hub-quote-detail__money-row--total'
                  }`}
                >
                  <span>{returnedAmount > 0.009 ? 'Total original' : 'Total'}</span>
                  <span>{fmtBrl(total)}</span>
                </div>
                {returnedAmount > 0.009 ? (
                  <div className="hub-quote-detail__money-row hub-quote-detail__money-row--discount">
                    <span>Devolvido</span>
                    <span>−{fmtBrl(returnedAmount)}</span>
                  </div>
                ) : null}
                {returnedAmount > 0.009 || (netTotal != null && Math.abs((netTotal ?? total) - total) > 0.009) ? (
                  <div className="hub-quote-detail__money-row hub-quote-detail__money-row--total">
                    <span>Vigente</span>
                    <span>{fmtBrl(netTotal ?? Math.max(0, total - returnedAmount))}</span>
                  </div>
                ) : null}
                {paidTotal > 0.009 || returnedAmount > 0.009 ? (
                  <div className="hub-quote-detail__money-row">
                    <span>Pago líquido</span>
                    <span>{fmtBrl(paidTotal)}</span>
                  </div>
                ) : null}
                {balanceDue > 0.009 ? (
                  <div className="hub-quote-detail__money-row">
                    <span>Pendente</span>
                    <span>{fmtBrl(balanceDue)}</span>
                  </div>
                ) : null}
                {cardFeeTotalCentsPositive(cardFeeTotal) ? (
                  <>
                    <div className="hub-quote-detail__money-row">
                      <span>Taxa da maquininha</span>
                      <span>{fmtBrl(cardFeeTotal)}</span>
                    </div>
                    <div className="hub-quote-detail__money-row">
                      <span>Líquido estimado do cartão</span>
                      <span>{fmtBrl(cardNetTotal)}</span>
                    </div>
                    {cardWithoutFeeGrossTotal > 0.009 ? (
                      <p className="hub-quote-detail__money-hint">{CARD_FEE_PARTIAL_COVERAGE_HINT}</p>
                    ) : null}
                  </>
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
                {timeline.map((step) => (
                  <li
                    key={step.id}
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

        {showStickyActions ? (
          <div className="hub-comanda-sticky-actions" role="region" aria-label="Ações rápidas">
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
            {mode === 'caixa' && canEdit && onSendToFinancial ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onSendToFinancial}
              >
                <Send size={18} strokeWidth={2} aria-hidden />
                Enviar ao financeiro
              </button>
            ) : null}
            {onCheckout ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--primary"
                disabled={saving}
                onClick={onCheckout}
              >
                <Coins size={18} strokeWidth={2} aria-hidden />
                {checkoutLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default HubComandaDetailLayout;
