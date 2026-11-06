import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, MessageCircle } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubLoading } from '../../components/HubLoading';
import { useAlert } from '../../components/AlertProvider';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { digitsOnlyBrPhone, formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import { petAgeDetailedLabel } from '../pets/petAge';
import { PORTE_LABELS, type PetBodyPorteValue } from '../../utils/hubServiceTypesPricingMatrix';
import {
  hubReceptionApi,
  type ReceptionBoardItem,
  type ReceptionHandoffDetail,
  type ReceptionResolveAction,
} from '../../api/hubReceptionApi';
import { caixaSearchHref } from '../finance/hubRelatoriosLinks';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../clinica/clinica-page.css';
import './hub-reception.css';

function relativeToNow(iso: string): { kind: 'past' | 'future' | 'now'; text: string } | null {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 1) return { kind: 'now', text: 'agora' };
  const text =
    min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  if (ms < 0) return { kind: 'future', text: `em ${text}` };
  return { kind: 'past', text: `há ${text}` };
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function taskTimeline(view: ReceptionHandoffDetail): Array<{ label: string; value: string; hint?: string }> {
  const rows: Array<{ label: string; value: string; hint?: string }> = [];
  const starts = view.context?.starts_at ? String(view.context.starts_at) : null;
  const openedRel = relativeToNow(view.opened_at);
  const startsRel = starts ? relativeToNow(starts) : null;

  if (view.kind === 'chegada') {
    if (starts) {
      rows.push({
        label: 'Horário na agenda',
        value: formatWhen(starts),
        hint: startsRel
          ? startsRel.kind === 'future'
            ? startsRel.text
            : startsRel.kind === 'past'
              ? `atrasado ${startsRel.text.replace(/^há /, '')}`
              : startsRel.text
          : undefined,
      });
    } else {
      rows.push({
        label: view.status === 'open' ? 'Na fila desde' : 'Aberta em',
        value: formatWhen(view.opened_at),
        hint: openedRel?.kind === 'past' || openedRel?.kind === 'now' ? openedRel.text : undefined,
      });
    }
    if (starts && view.status === 'open' && openedRel?.kind === 'past') {
      const sameMoment = Math.abs(new Date(view.opened_at).getTime() - new Date(starts).getTime()) < 60_000;
      if (!sameMoment) {
        rows.push({
          label: 'Na fila da recepção',
          value: formatWhen(view.opened_at),
          hint: openedRel.text,
        });
      }
    }
  } else if (view.kind === 'retirada_balcao' || view.kind === 'embarque') {
    rows.push({
      label: view.kind === 'embarque' ? 'Aguardando embarque desde' : 'Pronto para retirar desde',
      value: formatWhen(view.opened_at),
      hint: openedRel?.kind === 'past' || openedRel?.kind === 'now' ? openedRel.text : undefined,
    });
    if (starts) {
      rows.push({ label: 'Horário do serviço', value: formatWhen(starts) });
    }
  } else if (view.kind === 'autorizar_extra') {
    rows.push({
      label: 'Pedido feito em',
      value: formatWhen(view.opened_at),
      hint: openedRel?.kind === 'past' || openedRel?.kind === 'now' ? openedRel.text : undefined,
    });
  } else if (view.kind === 'encaminhar') {
    rows.push({
      label: 'Chegou na clínica em',
      value: formatWhen(view.opened_at),
      hint: openedRel?.kind === 'past' || openedRel?.kind === 'now' ? openedRel.text : undefined,
    });
  } else {
    rows.push({
      label: view.status === 'open' ? 'Na fila desde' : 'Aberta em',
      value: formatWhen(view.opened_at),
      hint: openedRel?.kind === 'past' || openedRel?.kind === 'now' ? openedRel.text : undefined,
    });
  }

  if (view.resolved_at) {
    rows.push({
      label: 'Concluída em',
      value: formatWhen(view.resolved_at),
      hint: view.resolution || undefined,
    });
  }

  return rows;
}

function kindLabel(item: Pick<ReceptionBoardItem, 'kind' | 'status'>): string {
  if (item.status === 'cancelled') return 'Cancelada';
  if (item.status === 'done') return 'Concluída';
  return taskKindLabel(item.kind);
}

function taskKindLabel(kind: ReceptionBoardItem['kind']): string {
  if (kind === 'chegada') return 'Chegada';
  if (kind === 'autorizar_extra') return 'Autorizar extra';
  if (kind === 'encaminhar') return 'Encaminhar';
  if (kind === 'embarque') return 'Embarque';
  return 'Retirada no balcão';
}

/** Título do painel = coluna do quadro (não o nome do pet). */
function columnTitle(item: Pick<ReceptionBoardItem, 'kind' | 'status'>): string {
  if (item.status === 'done' || item.status === 'cancelled') return 'Feitos';
  if (item.kind === 'chegada') return 'Chegada';
  if (item.kind === 'autorizar_extra' || item.kind === 'encaminhar') return 'Atenção';
  return 'Saída';
}

function primaryAction(item: ReceptionBoardItem): { action: ReceptionResolveAction; label: string } | null {
  if (item.status !== 'open') return null;
  if (item.kind === 'chegada') return { action: 'chegou', label: 'Chegou' };
  if (item.kind === 'retirada_balcao') return { action: 'entreguei', label: 'Entreguei' };
  if (item.kind === 'embarque') return { action: 'embarquei', label: 'Embarcou' };
  if (item.kind === 'autorizar_extra' && item.context?.hub_service_type_id) {
    return { action: 'autorizar', label: 'Autorizar' };
  }
  return null;
}

function petInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export type ReceptionHandoffPanelProps = {
  open: boolean;
  item: ReceptionBoardItem | null;
  clinicId: string;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (item: ReceptionBoardItem, action: ReceptionResolveAction) => void;
  onScheduleDestination: (item: ReceptionBoardItem) => void;
};

const ReceptionHandoffPanel: React.FC<ReceptionHandoffPanelProps> = ({
  open,
  item,
  clinicId,
  canManage,
  busy,
  onClose,
  onAction,
  onScheduleDestination,
}) => {
  const { showError } = useAlert();
  const templates = useMessageTemplates();
  const [detail, setDetail] = useState<ReceptionHandoffDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void hubReceptionApi
      .detail(item.id, clinicId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDetail(null);
          showError((e as Error)?.message || 'Erro ao carregar detalhes');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item?.id, clinicId, showError, item]);

  const view = detail;
  const boardFallback = item;
  const currentItem = view ?? boardFallback;
  const action = currentItem ? primaryAction(currentItem) : null;
  const phone = view?.guardian?.phone ?? boardFallback?.guardian?.phone ?? null;
  const panelTitle = currentItem ? columnTitle(currentItem) : 'Recepção';
  const panelSubtitle = currentItem ? taskKindLabel(currentItem.kind) : undefined;
  const displayPetName = (() => {
    const candidates = [view?.pet.name, boardFallback?.pet.name];
    for (const name of candidates) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (trimmed && trimmed.toLowerCase() !== 'pet' && trimmed.toLowerCase() !== 'sem nome') return trimmed;
    }
    for (const name of candidates) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (trimmed && trimmed.toLowerCase() !== 'pet') return trimmed;
    }
    return 'Sem nome';
  })();
  const waChat = phone ? buildWhatsappLink(phone, '') : null;
  const wa =
    phone && view && (view.kind === 'retirada_balcao' || view.kind === 'embarque')
      ? buildWhatsappLink(
          phone,
          renderTemplate('pet_ready', {
            tutor: view.guardian?.full_name || '',
            pet: displayPetName,
          }, templates),
        )
      : null;

  const petFacts = useMemo(() => {
    if (!view) return [] as Array<{ label: string; value: string }>;
    const porte =
      view.pet.size_tier && PORTE_LABELS[view.pet.size_tier as PetBodyPorteValue]
        ? PORTE_LABELS[view.pet.size_tier as PetBodyPorteValue]
        : view.pet.size_tier;
    const age = view.pet.birth_date ? petAgeDetailedLabel(view.pet.birth_date) : null;
    const rows: Array<{ label: string; value: string }> = [];
    if (view.pet.species) rows.push({ label: 'Espécie', value: view.pet.species });
    if (view.pet.breed) rows.push({ label: 'Raça', value: view.pet.breed });
    if (age && age !== '—') rows.push({ label: 'Idade', value: age });
    if (porte) rows.push({ label: 'Porte', value: String(porte) });
    if (view.pet.coat_type) rows.push({ label: 'Pelagem', value: view.pet.coat_type });
    if (view.unit_name) rows.push({ label: 'Unidade', value: view.unit_name });
    return rows;
  }, [view]);

  const footer = useMemo(() => {
    const current = view ?? boardFallback;
    if (!current || current.status !== 'open' || !canManage) {
      return (
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={onClose}>
          Fechar
        </button>
      );
    }
    return (
      <div className="hub-clinic-queue__actions" style={{ marginTop: 0 }}>
        {current.kind === 'encaminhar' ? (
          <>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={busy}
              onClick={() => onScheduleDestination(current)}
            >
              Agendar destino
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={busy}
              onClick={() => onAction(current, 'recebi')}
            >
              {busy ? 'Salvando…' : 'Só recebi'}
            </button>
          </>
        ) : null}
        {action ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={busy}
            onClick={() => onAction(current, action.action)}
          >
            {busy ? 'Salvando…' : action.label}
          </button>
        ) : null}
        {current.kind === 'autorizar_extra' ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={busy}
            onClick={() => onAction(current, 'dispensar')}
          >
            Dispensar
          </button>
        ) : null}
        {wa ? (
          <a className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" href={wa} target="_blank" rel="noreferrer">
            <MessageCircle size={14} aria-hidden /> Avisar
          </a>
        ) : null}
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={onClose}>
          Fechar
        </button>
      </div>
    );
  }, [view, boardFallback, canManage, action, busy, wa, onAction, onClose, onScheduleDestination]);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={panelTitle}
      titleIcon={<Inbox size={16} aria-hidden />}
      subtitle={panelSubtitle}
      contentKey={view?.id ?? boardFallback?.id}
      footer={footer}
    >
      {!view || loading ? (
        <HubLoading variant="block" label="Carregando detalhes…" />
      ) : (
        <div className="hub-reception-panel">
          <section className="hub-reception-panel__section" aria-label="Pet e tutor">
            <h3 className="hub-reception-panel__section-title">Pet</h3>
            <div className="hub-reception-panel__pet">
              <div className="hub-reception-panel__pet-head">
                {view.pet.avatar_url ? (
                  <img src={view.pet.avatar_url} alt="" className="hub-reception-panel__pet-avatar" />
                ) : (
                  <div className="hub-reception-panel__pet-avatar hub-reception-panel__pet-avatar--fallback" aria-hidden>
                    {petInitials(displayPetName)}
                  </div>
                )}
                <div className="hub-reception-panel__pet-identity">
                  <p className="hub-reception-panel__pet-name">{displayPetName}</p>
                  <div className="hub-reception-panel__pet-badges">
                    <span className="hub-clientes__pill hub-clinic-queue__pill--waiting">{kindLabel(view)}</span>
                    {view.is_late ? (
                      <span className="hub-clientes__pill hub-clinic-queue__pill--waiting">Em atraso</span>
                    ) : null}
                  </div>
                </div>
                {wa ? (
                  <a className="hub-reception-panel__wa" href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle size={16} aria-hidden />
                    Avisar
                  </a>
                ) : null}
              </div>

              {petFacts.length > 0 ? (
                <dl className="hub-reception-panel__pet-facts">
                  {petFacts.map((fact) => (
                    <div key={fact.label} className="hub-reception-panel__pet-fact">
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <div className="hub-reception-panel__tutor">
                <p className="hub-reception-panel__tutor-label">Tutor</p>
                <p className="hub-reception-panel__tutor-name">{view.guardian?.full_name || 'Sem tutor'}</p>
                {phone ? (
                  <div className="hub-reception-panel__tutor-contact">
                    <a className="hub-reception-panel__tutor-phone" href={`tel:${digitsOnlyBrPhone(phone)}`}>
                      {formatBrPhoneDisplay(phone)}
                    </a>
                    {waChat ? (
                      <a
                        className="hub-reception-panel__tutor-wa"
                        href={waChat}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle size={14} aria-hidden />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="hub-clientes__muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                    Sem telefone
                  </p>
                )}
                {view.guardian?.email ? (
                  <p className="hub-clientes__muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                    {view.guardian.email}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {view.next_step ? (
            <div className="hub-reception-panel__next" role="status">
              <p className="hub-reception-panel__next-label">O que fazer</p>
              <p className="hub-reception-panel__next-text">{view.next_step}</p>
            </div>
          ) : null}

          {view.cues.length > 0 ? (
            <section className="hub-reception-panel__section" aria-label="Contexto operacional">
              <h3 className="hub-reception-panel__section-title">Contexto</h3>
              <ul className="hub-reception-panel__cues">
                {view.cues.map((cue) => (
                  <li key={cue.key} className="hub-reception-panel__cue">
                    <p className="hub-reception-panel__cue-label">{cue.label}</p>
                    {cue.detail ? <p className="hub-reception-panel__cue-detail">{cue.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.charge_pending ? (
            <div className="hub-reception-panel__charge" role="status">
              <p className="hub-reception-panel__charge-text">Há cobrança em aberto no Caixa.</p>
              <Link
                to={caixaSearchHref({
                  q: displayPetName !== 'Sem nome' ? displayPetName : view.guardian?.full_name,
                  status: 'comanda_aberta',
                })}
                className="hub-reception-panel__charge-link"
              >
                Ir ao Caixa
              </Link>
            </div>
          ) : null}

          <section className="hub-reception-panel__section" aria-label="Detalhes da tarefa">
            <h3 className="hub-reception-panel__section-title">Tarefa</h3>
            <div className="hub-reception-panel__task">
              <div className="hub-reception-panel__task-head">
                <div className="hub-reception-panel__task-title-wrap">
                  <p className="hub-reception-panel__task-title">{taskKindLabel(view.kind)}</p>
                  <p className="hub-reception-panel__task-service">{view.context?.label || 'Operação'}</p>
                </div>
                <span
                  className={`hub-clientes__pill ${
                    view.status === 'done'
                      ? 'hub-clinic-queue__pill--done'
                      : view.status === 'cancelled'
                        ? 'hub-clinic-queue__pill--waiting'
                        : 'hub-clinic-queue__pill--progress'
                  }`}
                >
                  {view.status === 'open' ? 'Aberta' : view.status === 'done' ? 'Concluída' : 'Cancelada'}
                </span>
              </div>

              <ul className="hub-reception-panel__timeline">
                {taskTimeline(view).map((row) => (
                  <li key={row.label} className="hub-reception-panel__timeline-item">
                    <div className="hub-reception-panel__timeline-dot" aria-hidden />
                    <div className="hub-reception-panel__timeline-body">
                      <p className="hub-reception-panel__timeline-label">{row.label}</p>
                      <p className="hub-reception-panel__timeline-value">
                        {row.value}
                        {row.hint ? <span className="hub-reception-panel__timeline-hint">{row.hint}</span> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <Link to={view.origin.href} className="hub-reception-panel__origin-link">
                <span>
                  <span className="hub-clientes__muted">Ver na origem</span>
                  <strong>{view.origin.label}</strong>
                </span>
                <span aria-hidden>→</span>
              </Link>
            </div>
          </section>

          {view.pet.notes ? (
            <section className="hub-reception-panel__section" aria-label="Observações do pet">
              <h3 className="hub-reception-panel__section-title">Observações do pet</h3>
              <p className="hub-reception-panel__notes">{view.pet.notes}</p>
            </section>
          ) : null}
        </div>
      )}
    </HubSidePanel>
  );
};

export default ReceptionHandoffPanel;
