import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Plus,
  Send,
  Star,
  UserCog,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import {
  hubSupportTicketsApi,
  notifyHubSupportTicketsUpdated,
  type HubSupportTicket,
  type HubTicketMessage,
} from '../../api/hubSupportTicketsApi';
import { useAlert } from '../../components/AlertProvider';
import { HubSupportTicketModal } from './HubSupportTicketModal';
import {
  HUB_SUPPORT_PRIORITY_LABELS,
  HUB_SUPPORT_STATUS_LABELS,
  hubSupportCategoryLabel,
} from './hubSupportLabels';
import '../clientes/clientes.css';
import './hub-support.css';

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 1000;
const POLL_MS = 15_000;
const DESKTOP_QUERY = '(min-width: 861px)';

type ListFilter = 'active' | 'closed';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  técnico: Wrench,
  financeiro: CreditCard,
  conta_perfil: UserCog,
};

const RATING_LABELS = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

function isTicketClosed(t: HubSupportTicket): boolean {
  return Boolean(t.evaluation) || t.status === 'resolved' || t.status === 'closed';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function openedAtLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${timeOfDay(iso)}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EU';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function CategoryIcon({ category, size = 16 }: { category?: string | null; size?: number }) {
  const Icon = (category && CATEGORY_ICONS[category]) || HelpCircle;
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

function StatusChip({ ticket }: { ticket: HubSupportTicket }) {
  return (
    <span className={`hub-support__status hub-support__status--${ticket.status}`}>
      {HUB_SUPPORT_STATUS_LABELS[ticket.status]}
    </span>
  );
}

const HubSupportTicketsPage: React.FC = () => {
  const { user } = useAuth();
  const authUser = user as { id?: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null;
  const userId = authUser?.id;
  const myInitials = initialsOf(
    authUser?.user_metadata?.name || authUser?.user_metadata?.full_name || authUser?.email || '',
  );
  const { showError, showSuccess } = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tickets, setTickets] = useState<HubSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<ListFilter>('active');
  const [messages, setMessages] = useState<HubTicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingEvaluation, setSubmittingEvaluation] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selectedId = searchParams.get('ticket');
  const createOpen = searchParams.get('novo') === '1';
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value == null) next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadTickets = useCallback(async () => {
    if (!userId) return [];
    setFailed(false);
    try {
      const rows = await hubSupportTicketsApi.listMine(userId);
      setTickets(rows);
      return rows;
    } catch {
      setFailed(true);
      return [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadMessages = useCallback(
    async (ticketId: string, opts: { silent?: boolean } = {}) => {
      if (!userId) return;
      if (!opts.silent) setMessagesLoading(true);
      try {
        const rows = await hubSupportTicketsApi.getMessages(ticketId);
        setMessages(rows);
        if (rows.some((m) => m.sender_role === 'admin' && !m.read_by_receiver)) {
          await hubSupportTicketsApi.markMessagesRead(ticketId, userId);
          setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, unread_count: 0 } : t)));
          notifyHubSupportTicketsUpdated();
        }
      } catch (e: unknown) {
        if (!opts.silent) showError((e as Error)?.message || 'Erro ao carregar a conversa');
      } finally {
        if (!opts.silent) setMessagesLoading(false);
      }
    },
    [userId, showError],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  // Ao abrir via link (notificação), mostra a aba certa para o ticket selecionado.
  useEffect(() => {
    if (selected) setFilter(isTicketClosed(selected) ? 'closed' : 'active');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraft('');
    setEvaluating(false);
    setRating(0);
    setRatingComment('');
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Atualiza a conversa aberta e a lista enquanto a aba estiver visível.
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void loadTickets();
      if (selectedId) void loadMessages(selectedId, { silent: true });
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId, selectedId, loadTickets, loadMessages]);

  const counts = useMemo(() => {
    const closed = tickets.filter(isTicketClosed).length;
    return { active: tickets.length - closed, closed };
  }, [tickets]);

  const visibleTickets = useMemo(
    () => tickets.filter((t) => (filter === 'closed' ? isTicketClosed(t) : !isTicketClosed(t))),
    [tickets, filter],
  );

  // No desktop, abre o ticket mais recente da aba em vez de deixar a conversa vazia.
  useEffect(() => {
    if (loading || selectedId || visibleTickets.length === 0) return;
    if (window.matchMedia(DESKTOP_QUERY).matches) updateParams({ ticket: visibleTickets[0].id });
  }, [loading, selectedId, visibleTickets, updateParams]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedId]);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = async () => {
    if (!selected || !userId || sending) return;
    const text = draft.trim();
    if (text.length < MESSAGE_MIN) {
      showError(`A mensagem deve ter pelo menos ${MESSAGE_MIN} caracteres.`);
      return;
    }
    setSending(true);
    try {
      await hubSupportTicketsApi.addMessage(selected.id, userId, text);
      setDraft('');
      if (composerRef.current) composerRef.current.style.height = 'auto';
      await Promise.all([loadMessages(selected.id, { silent: true }), loadTickets()]);
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  };

  const handleEvaluate = async () => {
    if (!selected || rating < 1) return;
    setSubmittingEvaluation(true);
    try {
      await hubSupportTicketsApi.evaluate(selected.id, rating, ratingComment);
      await loadTickets();
      setEvaluating(false);
      setFilter('closed');
      showSuccess('Obrigado pela avaliação! O ticket foi encerrado.');
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao avaliar o ticket');
    } finally {
      setSubmittingEvaluation(false);
    }
  };

  const handleCreated = (ticket: HubSupportTicket) => {
    setFilter('active');
    void loadTickets().then(() => updateParams({ novo: null, ticket: ticket.id }));
    showSuccess('Ticket enviado! Você será avisado quando o suporte responder.');
  };

  const groupedMessages = useMemo(() => {
    const groups: { day: string; items: HubTicketMessage[] }[] = [];
    messages.forEach((m) => {
      const day = dayLabel(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    });
    return groups;
  }, [messages]);

  if (!userId) return null;

  const closed = selected ? isTicketClosed(selected) : false;
  const waitingSupport = selected && !closed && selected.last_message_by !== 'admin';
  const ratingShown = hoverRating || rating;

  if (!loading && tickets.length === 0) {
    return (
      <div className="hub-support">
        <div className="hub-support__hero">
          <span className="hub-support__hero-icon" aria-hidden>
            <LifeBuoy size={28} strokeWidth={1.6} />
          </span>
          <h2 className="hub-support__hero-title">Precisa de ajuda com o PetMi Hub?</h2>
          <p className="hub-support__hero-text">
            {failed
              ? 'Não foi possível carregar seus tickets agora. Tente novamente em instantes.'
              : 'Abra um ticket para dúvidas, problemas ou sugestões. A equipe PetMi responde por aqui e você é avisado no sino de notificações.'}
          </p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => updateParams({ novo: '1' })}
          >
            <Plus size={16} aria-hidden />
            Abrir ticket
          </button>
        </div>
        <HubSupportTicketModal open={createOpen} onClose={() => updateParams({ novo: null })} onCreated={handleCreated} />
      </div>
    );
  }

  return (
    <div className={`hub-support${selected ? ' hub-support--thread-open' : ''}`}>
      <div className="hub-support__layout">
        <aside className="hub-support__list" aria-label="Seus tickets">
          <div className="hub-support__list-head">
            <div className="hub-support__tabs" role="tablist" aria-label="Filtrar tickets">
              {(['active', 'closed'] as ListFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`hub-support__tab${filter === key ? ' hub-support__tab--active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {key === 'active' ? 'Em aberto' : 'Encerrados'}
                  <span className="hub-support__tab-count">{counts[key]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="hub-support__new"
              onClick={() => updateParams({ novo: '1' })}
              aria-label="Novo ticket"
              title="Novo ticket"
            >
              <Plus size={18} aria-hidden />
            </button>
          </div>

          {loading ? (
            <ul className="hub-support__items" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="hub-support__skeleton" />
              ))}
            </ul>
          ) : visibleTickets.length === 0 ? (
            <p className="hub-support__list-empty">
              {filter === 'active' ? 'Nenhum ticket em aberto. Tudo certo por aqui!' : 'Nenhum ticket encerrado ainda.'}
            </p>
          ) : (
            <ul className="hub-support__items">
              {visibleTickets.map((ticket) => {
                const unread = ticket.unread_count ?? 0;
                const last = ticket.last_message;
                const preview = last?.message ?? ticket.message ?? '';
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={[
                        'hub-support__item',
                        ticket.id === selectedId ? 'hub-support__item--active' : '',
                        unread > 0 ? 'hub-support__item--unread' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => updateParams({ ticket: ticket.id })}
                    >
                      <span className="hub-support__item-icon">
                        <CategoryIcon category={ticket.category} />
                      </span>
                      <span className="hub-support__item-body">
                        <span className="hub-support__item-top">
                          <span className="hub-support__item-title">{hubSupportCategoryLabel(ticket.category)}</span>
                          <span className="hub-support__item-time">
                            {relativeTime(ticket.last_message_at ?? ticket.created_at)}
                          </span>
                        </span>
                        <span className="hub-support__item-preview">
                          {last?.sender_role === 'admin' && <strong>Suporte: </strong>}
                          {preview}
                        </span>
                        <span className="hub-support__item-meta">
                          <StatusChip ticket={ticket} />
                          <span className="hub-support__item-id">#{ticket.id.slice(0, 6)}</span>
                          {unread > 0 && (
                            <span className="hub-support__unread" aria-label={`${unread} resposta(s) nova(s)`}>
                              {unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="hub-support__thread" aria-label="Conversa do ticket">
          {!selected ? (
            <div className="hub-support__thread-empty">
              <MessageSquare size={32} strokeWidth={1.4} aria-hidden />
              <p>Selecione um ticket para ver a conversa.</p>
            </div>
          ) : (
            <>
              <header className="hub-support__thread-head">
                <button
                  type="button"
                  className="hub-support__back"
                  onClick={() => updateParams({ ticket: null })}
                  aria-label="Voltar para a lista"
                >
                  <ArrowLeft size={18} aria-hidden />
                </button>
                <span className="hub-support__thread-icon">
                  <CategoryIcon category={selected.category} size={18} />
                </span>
                <div className="hub-support__thread-heading">
                  <div className="hub-support__thread-title-row">
                    <h2 className="hub-support__thread-title">{hubSupportCategoryLabel(selected.category)}</h2>
                    <StatusChip ticket={selected} />
                  </div>
                  <p className="hub-support__thread-meta">
                    #{selected.id.slice(0, 6)} · Aberto em {openedAtLabel(selected.created_at)}
                    {selected.priority ? ` · Prioridade ${HUB_SUPPORT_PRIORITY_LABELS[selected.priority].toLowerCase()}` : ''}
                  </p>
                </div>
                {!closed && !evaluating && (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-support__resolve"
                    onClick={() => setEvaluating(true)}
                  >
                    <CheckCircle2 size={16} aria-hidden />
                    <span>Marcar como resolvido</span>
                  </button>
                )}
              </header>

              <div className="hub-support__messages" ref={messagesRef}>
                {messagesLoading && messages.length === 0 ? (
                  <p className="hub-support__state">Carregando conversa…</p>
                ) : (
                  groupedMessages.map((group) => (
                    <React.Fragment key={group.day}>
                      <div className="hub-support__day" role="separator">
                        <span>{group.day}</span>
                      </div>
                      {group.items.map((m) => {
                        const fromSupport = m.sender_role === 'admin';
                        return (
                          <div
                            key={m.id}
                            className={`hub-support__msg hub-support__msg--${fromSupport ? 'support' : 'me'}`}
                          >
                            <span className="hub-support__avatar" aria-hidden>
                              {fromSupport ? <LifeBuoy size={16} strokeWidth={1.75} /> : myInitials}
                            </span>
                            <div className="hub-support__bubble">
                              <span className="hub-support__bubble-author">
                                {fromSupport ? 'Equipe PetMi' : 'Você'}
                                <time dateTime={m.created_at}>{timeOfDay(m.created_at)}</time>
                              </span>
                              <p className="hub-support__bubble-text">{m.message}</p>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </div>

              {waitingSupport && !evaluating && (
                <div className="hub-support__hint">
                  <Clock3 size={15} aria-hidden />
                  Aguardando resposta da equipe PetMi. Você será avisado no sino quando houver novidade.
                </div>
              )}

              {selected.evaluation ? (
                <div className="hub-support__closed">
                  <span className="hub-support__stars" aria-label={`Sua avaliação: ${selected.evaluation.rating} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={16}
                        aria-hidden
                        className={n <= selected.evaluation!.rating ? 'hub-support__star--on' : ''}
                      />
                    ))}
                  </span>
                  <p>Ticket encerrado com a sua avaliação. Precisa de algo mais? Abra um novo ticket.</p>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    onClick={() => updateParams({ novo: '1' })}
                  >
                    <Plus size={15} aria-hidden />
                    Novo ticket
                  </button>
                </div>
              ) : closed ? (
                <div className="hub-support__closed">
                  <p>Este ticket foi encerrado pelo suporte. Precisa de algo mais? Abra um novo ticket.</p>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    onClick={() => updateParams({ novo: '1' })}
                  >
                    <Plus size={15} aria-hidden />
                    Novo ticket
                  </button>
                </div>
              ) : evaluating ? (
                <div className="hub-support__evaluate">
                  <div className="hub-support__evaluate-head">
                    <p className="hub-support__evaluate-title">Seu problema foi resolvido? Avalie o atendimento</p>
                    <p className="hub-support__evaluate-sub">Ao avaliar, o ticket é encerrado.</p>
                  </div>
                  <div className="hub-support__rating">
                    <div
                      className="hub-support__stars hub-support__stars--input"
                      role="radiogroup"
                      aria-label="Nota do atendimento"
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          aria-label={`${n} de 5 — ${RATING_LABELS[n]}`}
                          className="hub-support__star-btn"
                          onMouseEnter={() => setHoverRating(n)}
                          onClick={() => setRating(n)}
                        >
                          <Star size={26} aria-hidden className={n <= ratingShown ? 'hub-support__star--on' : ''} />
                        </button>
                      ))}
                    </div>
                    <span className="hub-support__rating-label">{RATING_LABELS[ratingShown] || 'Escolha uma nota'}</span>
                  </div>
                  <textarea
                    className="hub-clientes__textarea hub-support__field"
                    rows={2}
                    maxLength={500}
                    value={ratingComment}
                    placeholder="Quer deixar um comentário? (opcional)"
                    onChange={(e) => setRatingComment(e.target.value)}
                  />
                  <div className="hub-clientes__btn-row">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                      disabled={rating < 1 || submittingEvaluation}
                      onClick={() => void handleEvaluate()}
                    >
                      {submittingEvaluation ? 'Enviando…' : 'Encerrar ticket'}
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      disabled={submittingEvaluation}
                      onClick={() => setEvaluating(false)}
                    >
                      Continuar conversa
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  className="hub-support__composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend();
                  }}
                >
                  <div className="hub-support__composer-box">
                    <textarea
                      ref={composerRef}
                      className="hub-support__composer-input"
                      rows={1}
                      maxLength={MESSAGE_MAX}
                      value={draft}
                      disabled={sending}
                      placeholder="Escreva uma mensagem para o suporte…"
                      aria-label="Mensagem para o suporte"
                      onChange={(e) => {
                        setDraft(e.target.value);
                        autoGrow(e.target);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="hub-support__send"
                      disabled={sending || draft.trim().length < MESSAGE_MIN}
                      aria-label="Enviar mensagem"
                    >
                      <Send size={16} aria-hidden />
                      <span>{sending ? 'Enviando…' : 'Enviar'}</span>
                    </button>
                  </div>
                  <p className="hub-support__composer-hint">
                    <kbd>Enter</kbd> envia · <kbd>Shift</kbd> + <kbd>Enter</kbd> quebra linha
                  </p>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      <HubSupportTicketModal open={createOpen} onClose={() => updateParams({ novo: null })} onCreated={handleCreated} />
    </div>
  );
};

export default HubSupportTicketsPage;
