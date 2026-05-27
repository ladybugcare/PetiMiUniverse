import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { HubQuote, HubQuoteLine } from '../../api/hubQuotesApi';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import { useAlert } from '../../components/AlertProvider';
import { maskTaxIdForList } from '../../utils/maskTaxId';
import {
  ageLabelPt,
  discountAmount,
  embedOne,
  petLabel,
  publicLineServiceSubtitle,
  publicLineServiceTitle,
  sexLabelPt,
  sizeTierLabelPt,
  staffStatusClass,
  staffStatusLabel,
} from './hubQuoteViewUtils';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  DollarSign,
  FileDown,
  Info,
  Lock,
  Mail,
  MessageCircle,
  MoreVertical,
  Dog,
  Pencil,
  Phone,
  Receipt,
  Send,
  Share2,
  User,
  Users,
} from 'lucide-react';

function waMeUrl(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length < 10) return null;
  const n = d.length <= 11 && !d.startsWith('55') ? `55${d}` : d;
  return `https://wa.me/${n}`;
}

function daysUntilExpiry(quote: HubQuote): string | null {
  if (!quote.expires_at) return null;
  const end = new Date(quote.expires_at).getTime();
  const now = Date.now();
  const ms = end - now;
  const d = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (d > 1) return `${d} dias restantes`;
  if (d === 1) return '1 dia restante';
  if (d === 0) return 'Expira hoje';
  return 'Expirado';
}

export interface HubQuoteDetailLayoutProps {
  quote: HubQuote;
  quoteId: string;
  viewerLabel: string;
  canWrite: boolean;
  saving: boolean;
  isDraft: boolean;
  canReopenForEdit: boolean;
  canConvert: boolean;
  dupGuardians: HubGuardian[];
  onSend: () => void;
  onAwaitingReturn: () => void;
  onReopenDraft: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onDeleteDraft: () => void;
  onOpenPdf: () => void;
  onCopyPublic: () => void;
  /** Abre fluxo guiado em Clientes (e pets); `linkGuardianId` quando associar tutor existente (CPF duplicado). */
  onGuidedConvert: (linkGuardianId?: string) => void;
  /** Conversão instantânea (cria tutor + pets) — menu «Mais». */
  onQuickConvert?: () => void;
}

const HubQuoteDetailLayout: React.FC<HubQuoteDetailLayoutProps> = ({
  quote,
  quoteId,
  viewerLabel,
  canWrite,
  saving,
  isDraft,
  canReopenForEdit,
  canConvert,
  dupGuardians,
  onSend,
  onAwaitingReturn,
  onReopenDraft,
  onDuplicate,
  onCancel,
  onDeleteDraft,
  onOpenPdf,
  onCopyPublic,
  onGuidedConvert,
  onQuickConvert,
}) => {
  const { showSuccess, showError } = useAlert();
  const prospect = embedOne(quote.prospect);
  const refShort = quote.id.slice(0, 8).toUpperCase();
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

  const expiredBanner =
    quote.expires_at &&
    quote.status !== 'accepted' &&
    quote.status !== 'cancelled' &&
    new Date(quote.expires_at).getTime() < Date.now();

  const timeline = useMemo(() => {
    type V = 'done' | 'active' | 'todo';
    const items: { title: string; sub?: string; variant: V }[] = [
      {
        title: 'Orçamento criado',
        sub: quote.created_at ? new Date(quote.created_at).toLocaleString('pt-BR') : undefined,
        variant: 'done',
      },
    ];
    if (quote.sent_at) {
      items.push({
        title: 'Enviado ao cliente',
        sub: new Date(quote.sent_at).toLocaleString('pt-BR'),
        variant: 'done',
      });
    }
    if (quote.status === 'awaiting_return') {
      items.push({
        title: 'Aguardando retorno do cliente',
        sub: 'Ativo',
        variant: 'active',
      });
    } else if (quote.status === 'sent' && quote.sent_at) {
      items.push({
        title: 'Em acompanhamento',
        sub: 'Pode marcar «Aguardando retorno» quando aplicável.',
        variant: 'todo',
      });
    }
    if (quote.status === 'accepted') {
      items.push({
        title: 'Orçamento aprovado',
        sub: quote.converted_at ? `Convertido em ${new Date(quote.converted_at).toLocaleString('pt-BR')}` : undefined,
        variant: 'done',
      });
    }
    if (quote.status === 'expired') {
      items.push({ title: 'Expirado', variant: 'active' });
    }
    if (quote.status === 'cancelled') {
      items.push({ title: 'Cancelado', variant: 'active' });
    }
    return items;
  }, [quote]);

  const copyTax = async () => {
    if (!prospect?.tax_id) return;
    try {
      await navigator.clipboard.writeText(prospect.tax_id);
      showSuccess('CPF copiado');
    } catch {
      showError('Não foi possível copiar');
    }
  };

  const copyFullId = async () => {
    try {
      await navigator.clipboard.writeText(quote.id);
      showSuccess('ID copiado');
    } catch {
      showError('Não foi possível copiar');
    }
  };

  const wa = prospect?.phone ? waMeUrl(prospect.phone) : null;
  const telHref = prospect?.phone ? `tel:${prospect.phone.replace(/\D/g, '')}` : null;

  const metaParts: string[] = [];
  if (quote.created_at) {
    metaParts.push(`Criado em ${new Date(quote.created_at).toLocaleString('pt-BR')}`);
  }
  if (quote.expires_at) {
    const expStr = new Date(quote.expires_at).toLocaleDateString('pt-BR', { dateStyle: 'short' });
    const days = daysUntilExpiry(quote);
    metaParts.push(`Válido até ${expStr}${days ? ` (${days})` : ''}`);
  }
  metaParts.push(`Responsável: ${viewerLabel}`);

  return (
    <div className="hub-quote-detail">
      <div className="hub-quote-detail__inner">
        <nav className="hub-quote-detail__crumb" aria-label="Navegação">
          <Link to="/hub/orcamentos">Orçamentos</Link>
          <ChevronRight size={14} aria-hidden />
          <span className="hub-quote-detail__crumb-current">#{refShort}</span>
        </nav>

        <header className="hub-quote-detail__hero">
          <div className="hub-quote-detail__hero-main">
            <div className="hub-quote-detail__title-row">
              <h1 className="hub-quote-detail__title">Orçamento #{refShort}</h1>
              <span className={staffStatusClass(quote.status)}>{staffStatusLabel(quote.status)}</span>
            </div>
            <p className="hub-quote-detail__meta-line">{metaParts.join(' · ')}</p>
          </div>
          <div className="hub-quote-detail__hero-actions">
            {canWrite && isDraft ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--primary"
                disabled={saving}
                onClick={onSend}
              >
                <Send size={18} strokeWidth={2} aria-hidden />
                Enviar orçamento
              </button>
            ) : null}
            {canWrite && isDraft ? (
              <Link to={`/hub/orcamentos/${quoteId}/editar`} className="hub-quote-detail__btn hub-quote-detail__btn--outline" title="Editar">
                <Pencil size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Editar</span>
              </Link>
            ) : canReopenForEdit ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onReopenDraft}
                title="Reabrir como rascunho"
              >
                <Pencil size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Editar</span>
              </button>
            ) : null}
            {canWrite &&
            (quote.status === 'sent' ||
              quote.status === 'awaiting_return' ||
              quote.status === 'expired' ||
              quote.status === 'cancelled') ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onDuplicate}
                title="Duplicar"
              >
                <Copy size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Duplicar</span>
              </button>
            ) : null}
            <button type="button" className="hub-quote-detail__btn hub-quote-detail__btn--outline" disabled={saving} onClick={onOpenPdf} title="PDF">
              <FileDown size={18} strokeWidth={2} aria-hidden />
              <span className="hub-quote-detail__btn-text">PDF</span>
            </button>
            {canWrite ? (
              <button
                type="button"
                className="hub-quote-detail__btn hub-quote-detail__btn--outline"
                disabled={saving}
                onClick={onCopyPublic}
                title="Copiar link público"
              >
                <Share2 size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">Compartilhar</span>
              </button>
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="hub-quote-detail__btn hub-quote-detail__btn--outline" title="WhatsApp">
                <MessageCircle size={18} strokeWidth={2} aria-hidden />
                <span className="hub-quote-detail__btn-text">WhatsApp</span>
              </a>
            ) : null}
            {canWrite ? (
              <details className="hub-quote-detail__more">
                <summary className="hub-quote-detail__btn hub-quote-detail__btn--outline hub-quote-detail__more-summary" aria-label="Mais ações">
                  <MoreVertical size={18} strokeWidth={2} />
                </summary>
                <div className="hub-quote-detail__more-panel">
                  {quote.status === 'sent' ? (
                    <button type="button" className="hub-quote-detail__more-item" disabled={saving} onClick={onAwaitingReturn}>
                      Marcar aguardando retorno
                    </button>
                  ) : null}
                  {quote.status !== 'accepted' && quote.status !== 'cancelled' && quote.status !== 'expired' ? (
                    <button type="button" className="hub-quote-detail__more-item" disabled={saving} onClick={onCancel}>
                      Cancelar orçamento
                    </button>
                  ) : null}
                  {canConvert && onQuickConvert ? (
                    <button type="button" className="hub-quote-detail__more-item" disabled={saving} onClick={onQuickConvert}>
                      Conversão rápida (tutor + pets automático)
                    </button>
                  ) : null}
                  {isDraft ? (
                    <button type="button" className="hub-quote-detail__more-item hub-quote-detail__more-item--danger" onClick={onDeleteDraft}>
                      Apagar rascunho
                    </button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </header>

        {isDraft && canWrite ? (
          <div className="hub-quote-detail__draft-banner" role="status">
            <p>
              Este orçamento é <strong>rascunho</strong>. O cliente só o vê após enviar.{' '}
              <Link to={`/hub/orcamentos/${quoteId}/editar`}>Editar conteúdo</Link>
            </p>
          </div>
        ) : null}

        {expiredBanner ? (
          <div className="hub-quote-detail__warn-banner" role="status">
            A validade deste orçamento já passou. Duplique ou reabra para ajustar antes de voltar a enviar.
          </div>
        ) : null}

        <div className="hub-quote-detail__grid">
          <div className="hub-quote-detail__main">
            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <User size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Contato</h2>
              </div>
              {prospect ? (
                <div className="hub-quote-detail__contact-grid">
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">Nome</span>
                    <span className="hub-quote-detail__field-value">{prospect.full_name}</span>
                  </div>
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">Telefone</span>
                    <span className="hub-quote-detail__field-value hub-quote-detail__field-value--row">
                      <Phone size={16} aria-hidden />
                      {telHref ? (
                        <a href={telHref} className="hub-quote-detail__link">
                          {prospect.phone}
                        </a>
                      ) : (
                        prospect.phone
                      )}
                      {wa ? (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="hub-quote-detail__ic-link" title="WhatsApp">
                          <MessageCircle size={18} />
                        </a>
                      ) : null}
                    </span>
                  </div>
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">CPF</span>
                    <span className="hub-quote-detail__field-value hub-quote-detail__field-value--row">
                      {maskTaxIdForList(prospect.tax_id)}
                      {prospect.tax_id ? (
                        <button type="button" className="hub-quote-detail__ic-btn" title="Copiar CPF" onClick={() => void copyTax()}>
                          <Copy size={16} />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">E-mail</span>
                    <span className="hub-quote-detail__field-value hub-quote-detail__field-value--row">
                      <Mail size={16} aria-hidden />
                      {prospect.email ? (
                        <a href={`mailto:${prospect.email}`} className="hub-quote-detail__link">
                          {prospect.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="hub-quote-detail__field">
                    <span className="hub-quote-detail__field-label">Origem</span>
                    <span className="hub-quote-detail__field-value">Orçamento Hub</span>
                  </div>
                </div>
              ) : (
                <p className="hub-quote-detail__muted">—</p>
              )}
            </section>

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head hub-quote-detail__card-head--spread">
                <div className="hub-quote-detail__card-head-left">
                  <Dog size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                  <h2 className="hub-quote-detail__card-title">Pets do orçamento ({pets.length})</h2>
                </div>
                {canWrite && isDraft ? (
                  <Link to={`/hub/orcamentos/${quoteId}/editar`} className="hub-quote-detail__text-btn">
                    Editar pets
                  </Link>
                ) : null}
              </div>
              {pets.length === 0 ? (
                <p className="hub-quote-detail__muted">Sem pets neste orçamento.</p>
              ) : (
                <div className="hub-quote-detail__pet-cards">
                  {pets.map((p, i) => (
                    <div key={p.id} className="hub-quote-detail__pet-card">
                      <div className="hub-quote-detail__pet-card-top">
                        <span className="hub-quote-detail__pet-badge">P{i + 1}</span>
                        <span className="hub-quote-detail__pet-breed">{p.breed?.trim() || p.species || '—'}</span>
                      </div>
                      <dl className="hub-quote-detail__pet-dl">
                        <div>
                          <dt>Porte</dt>
                          <dd>{sizeTierLabelPt(p.size_tier)}</dd>
                        </div>
                        <div>
                          <dt>Pelagem</dt>
                          <dd>{p.coat_type?.trim() || '—'}</dd>
                        </div>
                        <div>
                          <dt>Idade</dt>
                          <dd>{ageLabelPt(p.age_months)}</dd>
                        </div>
                        <div>
                          <dt>Sexo</dt>
                          <dd>{sexLabelPt(p.sex)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="hub-quote-detail__card hub-quote-detail__card--flush">
              <div className="hub-quote-detail__card-head hub-quote-detail__card-head--spread">
                <div className="hub-quote-detail__card-head-left">
                  <ClipboardList size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                  <h2 className="hub-quote-detail__card-title">Serviços e valores</h2>
                </div>
                {canWrite && isDraft ? (
                  <Link to={`/hub/orcamentos/${quoteId}/editar`} className="hub-quote-detail__text-btn">
                    Adicionar serviço
                  </Link>
                ) : null}
              </div>
              <div className="hub-quote-detail__table-scroll">
                <table className="hub-orcamento-novo__services-table hub-quote-detail__svc-table">
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      {pets.map((p, i) => (
                        <th key={p.id} className="right hub-quote-detail__th-pet">
                          <span className="hub-quote-detail__th-pet-name">{petLabel(p, i)}</span>
                          <span className="hub-quote-detail__th-pet-sub">({p.species})</span>
                        </th>
                      ))}
                      <th className="right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(2, 2 + pets.length)} className="hub-quote-detail__muted hub-quote-detail__td-empty">
                          Sem linhas de serviço.
                        </td>
                      </tr>
                    ) : (
                      lines.map((ln: HubQuoteLine) => {
                        const sub = publicLineServiceSubtitle(ln);
                        return (
                          <tr key={ln.id}>
                            <td>
                              <span className="hub-quote-detail__svc-title">{publicLineServiceTitle(ln)}</span>
                              {sub ? <span className="hub-quote-detail__svc-sub">{sub}</span> : null}
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

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head hub-quote-detail__card-head--spread">
                <h2 className="hub-quote-detail__card-title">Observações do orçamento</h2>
                {canWrite && isDraft ? (
                  <Link to={`/hub/orcamentos/${quoteId}/editar`} className="hub-quote-detail__text-btn">
                    Editar observação
                  </Link>
                ) : null}
              </div>
              {quote.client_notes?.trim() ? (
                <p className="hub-quote-detail__notes-body">{quote.client_notes.trim()}</p>
              ) : (
                <p className="hub-quote-detail__muted">Sem observação ao cliente.</p>
              )}
            </section>

            {quote.notes?.trim() ? (
              <section className="hub-quote-detail__card hub-quote-detail__card--internal">
                <h2 className="hub-quote-detail__card-title">Notas internas (equipa)</h2>
                <p className="hub-quote-detail__notes-body hub-quote-detail__notes-body--pre">{quote.notes.trim()}</p>
              </section>
            ) : null}

            <div className="hub-quote-detail__lock-banner" role="note">
              <Lock size={18} strokeWidth={2} aria-hidden />
              <p>
                Este orçamento é temporário: não cria cadastros oficiais na clínica até ser aprovado e convertido em cliente (tutor +
                pets).
              </p>
            </div>
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
                  <span>{brl(Number(quote.subtotal_amount ?? 0))}</span>
                </div>
                {disc > 0 ? (
                  <div className="hub-quote-detail__money-row hub-quote-detail__money-row--discount">
                    <span>
                      {quote.discount_kind === 'percent'
                        ? `Desconto (${Math.min(100, Math.max(0, Number(quote.discount_value ?? 0)))}%)`
                        : 'Desconto'}
                    </span>
                    <span>−{brl(disc)}</span>
                  </div>
                ) : null}
                <div className="hub-quote-detail__money-row hub-quote-detail__money-row--total">
                  <span>Total</span>
                  <span>{brl(Number(quote.total_amount))}</span>
                </div>
              </div>
            </section>

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <Clock size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Timeline do orçamento</h2>
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
              <p className="hub-quote-detail__timeline-foot">Histórico detalhado de visualizações virá numa versão futura.</p>
            </section>

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <Users size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <div>
                  <h2 className="hub-quote-detail__card-title">Converter orçamento</h2>
                  <p className="hub-quote-detail__card-sub">Converta este orçamento em registos oficiais quando o cliente aceitar.</p>
                </div>
              </div>
              {quote.status === 'accepted' && quote.guardian_id ? (
                <Link to={`/hub/clientes/${quote.guardian_id}`} className="hub-quote-detail__btn hub-quote-detail__btn--primary hub-quote-detail__btn--block">
                  Ver tutor
                </Link>
              ) : (
                <>
                  <div className="hub-quote-detail__convert-grid">
                    <button
                      type="button"
                      className="hub-quote-detail__convert-tile"
                      disabled={!canConvert || saving}
                      onClick={() => onGuidedConvert()}
                    >
                      <User size={22} strokeWidth={1.75} aria-hidden />
                      <span className="hub-quote-detail__convert-tile-title">Converter tutor</span>
                      <span className="hub-quote-detail__convert-tile-sub">Criar cliente</span>
                    </button>
                    <div className="hub-quote-detail__convert-tile hub-quote-detail__convert-tile--muted" title="Incluído na conversão do tutor">
                      <Dog size={22} strokeWidth={1.75} aria-hidden />
                      <span className="hub-quote-detail__convert-tile-title">Converter pets</span>
                      <span className="hub-quote-detail__convert-tile-sub">Com o tutor</span>
                    </div>
                    <Link to="/hub/appointments" className="hub-quote-detail__convert-tile hub-quote-detail__convert-tile--link">
                      <Calendar size={22} strokeWidth={1.75} aria-hidden />
                      <span className="hub-quote-detail__convert-tile-title">Criar agendamento</span>
                      <span className="hub-quote-detail__convert-tile-sub">Abrir agenda</span>
                    </Link>
                    <Link to="/hub/financeiro" className="hub-quote-detail__convert-tile hub-quote-detail__convert-tile--link">
                      <Receipt size={22} strokeWidth={1.75} aria-hidden />
                      <span className="hub-quote-detail__convert-tile-title">Gerar venda</span>
                      <span className="hub-quote-detail__convert-tile-sub">Financeiro</span>
                    </Link>
                  </div>
                  {dupGuardians.length > 0 ? (
                    <div className="hub-quote-detail__dup-box">
                      <p className="hub-quote-detail__dup-title">Tutores com o mesmo CPF</p>
                      <ul className="hub-quote-detail__dup-list">
                        {dupGuardians.map((g) => (
                          <li key={g.id}>
                            {g.full_name}{' '}
                            <button type="button" className="hub-quote-detail__text-btn" onClick={() => onGuidedConvert(g.id)}>
                              Associar
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {!canConvert ? (
                    <p className="hub-quote-detail__muted hub-quote-detail__convert-hint">
                      Envie o orçamento e aguarde resposta do cliente para habilitar a conversão em tutor + pets.
                    </p>
                  ) : null}
                </>
              )}
            </section>

            <section className="hub-quote-detail__card">
              <div className="hub-quote-detail__card-head">
                <Info size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
                <h2 className="hub-quote-detail__card-title">Informações adicionais</h2>
              </div>
              <dl className="hub-quote-detail__info-dl">
                <div>
                  <dt>Responsável</dt>
                  <dd>{viewerLabel}</dd>
                </div>
                <div>
                  <dt>Unidade</dt>
                  <dd>{quote.unit_id ? quote.unit_id.slice(0, 8) + '…' : 'Unidade padrão / não atribuída'}</dd>
                </div>
                <div>
                  <dt>ID do orçamento</dt>
                  <dd className="hub-quote-detail__info-id-row">
                    <code className="hub-quote-detail__mono">#{refShort}</code>
                    <button type="button" className="hub-quote-detail__ic-btn" title="Copiar UUID" onClick={() => void copyFullId()}>
                      <Copy size={16} />
                    </button>
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default HubQuoteDetailLayout;
