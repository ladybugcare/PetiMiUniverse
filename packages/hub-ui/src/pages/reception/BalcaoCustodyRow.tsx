import React from 'react';
import { MessageCircle } from 'lucide-react';
import type { ReceptionBoardItem, ReceptionResolveAction, ReceptionResolvePayload } from '../../api/hubReceptionApi';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { renderTemplate } from '../../utils/hubMessageTemplates';
import { useMessageTemplates } from '../../utils/useMessageTemplates';
import {
  custodyMetaParts,
  isAttentionBlocking,
  kindLabel,
  pillClass,
  primaryAction,
  scheduleDestinationPath,
} from './balcaoUi';

export type BalcaoCustodyRowProps = {
  item: ReceptionBoardItem;
  day: string;
  canManage: boolean;
  busy: boolean;
  muted?: boolean;
  onSelect: (item: ReceptionBoardItem) => void;
  onAction: (item: ReceptionBoardItem, action: ReceptionResolveAction, payload?: ReceptionResolvePayload) => void;
  onScheduleDestination: (item: ReceptionBoardItem) => void;
  onFocusCobrar: () => void;
  onRequestRelease?: (item: ReceptionBoardItem, action: ReceptionResolveAction) => void;
};

const BalcaoCustodyRow: React.FC<BalcaoCustodyRowProps> = ({
  item,
  day,
  canManage,
  busy,
  muted = false,
  onSelect,
  onAction,
  onScheduleDestination,
  onFocusCobrar,
  onRequestRelease,
}) => {
  const templates = useMessageTemplates();
  const action = primaryAction(item);
  const late =
    item.kind === 'chegada' &&
    item.status === 'open' &&
    Boolean(item.context?.starts_at) &&
    new Date(item.context.starts_at as string).getTime() < Date.now();
  const phone = item.guardian?.phone;
  const wa =
    phone && (item.kind === 'retirada_balcao' || item.kind === 'embarque')
      ? buildWhatsappLink(
          phone,
          renderTemplate('pet_ready', { tutor: item.guardian?.full_name || '', pet: item.pet.name }, templates),
        )
      : null;
  const showChargeBadge = item.charge_pending === true;
  const tutor = item.guardian?.full_name || 'Sem tutor';
  const metaParts = custodyMetaParts(item);
  const blocking = isAttentionBlocking(item);

  const runPrimary = () => {
    if (!action) return;
    if (
      (action.action === 'entreguei' || action.action === 'embarquei') &&
      showChargeBadge &&
      onRequestRelease
    ) {
      onRequestRelease(item, action.action);
      return;
    }
    onAction(item, action.action);
  };

  return (
    <li
      className={[
        'hub-balcao-row',
        late ? 'hub-balcao-row--late' : '',
        item.status !== 'open' ? 'hub-balcao-row--done' : '',
        muted ? 'hub-balcao-row--muted' : '',
        blocking ? 'hub-balcao-row--blocking' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${item.pet.name} — ${kindLabel(item)}`}
    >
      <div className="hub-balcao-row__identity">
        <p className="hub-balcao-row__pet" title={item.pet.name}>
          {item.pet.name}
        </p>
        <p className="hub-balcao-row__tutor" title={tutor}>
          {tutor}
        </p>
      </div>

      <div className="hub-balcao-row__status">
        <span className={pillClass(item)}>{kindLabel(item)}</span>
        {late ? <span className="hub-grooming-queue__late-tag">Em atraso</span> : null}
        {showChargeBadge ? <span className="hub-balcao-row__charge-badge">Cobrar</span> : null}
        {blocking ? <span className="hub-balcao-row__block-badge">Bloqueia</span> : null}
      </div>

      <p className="hub-balcao-row__meta" title={metaParts.join(' · ')}>
        {metaParts.join(' · ') || '—'}
      </p>

      {item.kind === 'lt_falha' && item.context?.failure_reason ? (
        <p className="hub-reception__failure-reason">{item.context.failure_reason}</p>
      ) : null}

      <div
        className="hub-balcao-row__actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {item.status === 'open' && canManage && item.kind === 'encaminhar' ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            onClick={() => {
              scheduleDestinationPath(item, day);
              onScheduleDestination(item);
            }}
          >
            Agendar destino
          </button>
        ) : null}
        {item.status === 'open' && canManage && item.kind === 'lt_falha' ? (
          <>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => onSelect(item)}
            >
              Resolver
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={busy}
              onClick={() => onAction(item, 'tutor_busca')}
            >
              {busy ? 'Salvando…' : 'Tutor busca'}
            </button>
          </>
        ) : null}
        {item.status === 'open' && canManage && action ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={busy}
            onClick={runPrimary}
          >
            {busy ? 'Salvando…' : action.label}
          </button>
        ) : null}
        {item.status === 'open' && canManage && item.kind === 'autorizar_extra' ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={busy}
            onClick={() => onAction(item, 'dispensar')}
          >
            Dispensar
          </button>
        ) : null}
        {item.status === 'open' && canManage && showChargeBadge ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={onFocusCobrar}
          >
            Cobrar
          </button>
        ) : null}
        {item.status === 'open' && canManage && wa ? (
          <a
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            href={wa}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={14} aria-hidden /> Avisar
          </a>
        ) : null}
      </div>
    </li>
  );
};

export default BalcaoCustodyRow;
