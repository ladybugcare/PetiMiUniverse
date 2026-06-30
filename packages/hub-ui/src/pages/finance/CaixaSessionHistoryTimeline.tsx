import React, { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CreditCard,
  FileText,
  Link2,
  QrCode,
  Repeat,
  User,
  Wallet,
} from 'lucide-react';
import {
  formatHistoryAmount,
  formatHistoryTime,
  type CaixaHistoryIconKind,
  type CaixaHistoryIconTone,
  type CaixaSessionHistoryItem,
} from './hubCaixaSessionHistory';

const INITIAL_VISIBLE = 6;

function HistoryIcon({ kind, tone }: { kind: CaixaHistoryIconKind; tone: CaixaHistoryIconTone }) {
  const iconProps = { size: 12, strokeWidth: 2.25, 'aria-hidden': true as const };
  let node: React.ReactNode;
  switch (kind) {
    case 'pix':
      node = <QrCode {...iconProps} />;
      break;
    case 'cash':
      node = <Wallet {...iconProps} />;
      break;
    case 'credit_card':
    case 'debit_card':
      node = <CreditCard {...iconProps} />;
      break;
    case 'transfer':
      node = <Repeat {...iconProps} />;
      break;
    case 'payment_link':
      node = <Link2 {...iconProps} />;
      break;
    case 'customer_credit':
      node = <User {...iconProps} />;
      break;
    case 'withdrawal':
      node = <ArrowDownToLine {...iconProps} />;
      break;
    case 'deposit':
      node = <ArrowUpFromLine {...iconProps} />;
      break;
    case 'comanda':
      node = <FileText {...iconProps} />;
      break;
    default:
      node = <Banknote {...iconProps} />;
  }
  return (
    <span className={`hub-caixa-timeline__dot hub-caixa-timeline__dot--${tone}`}>
      {node}
    </span>
  );
}

function amountTone(item: CaixaSessionHistoryItem): 'pos' | 'neg' | 'neutral' | 'pending' {
  if (item.is_pending) return 'pending';
  if (item.signed_amount < -0.009) return 'neg';
  if (item.row_kind === 'billing') return 'neutral';
  return 'pos';
}

export type CaixaSessionHistoryTimelineProps = {
  items: CaixaSessionHistoryItem[];
  onSelect: (item: CaixaSessionHistoryItem) => void;
};

export const CaixaSessionHistoryTimeline: React.FC<CaixaSessionHistoryTimelineProps> = ({
  items,
  onSelect,
}) => {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(
    () => (expanded ? items : items.slice(0, INITIAL_VISIBLE)),
    [expanded, items],
  );
  const hasMore = items.length > INITIAL_VISIBLE;

  return (
    <>
      <ol className="hub-caixa-timeline">
        {visibleItems.map((item, index) => {
          const tone = amountTone(item);
          const isLast = index === visibleItems.length - 1;
          return (
            <li key={item.id} className="hub-caixa-timeline__item">
              <time className="hub-caixa-timeline__time" dateTime={item.happened_at}>
                {formatHistoryTime(item.happened_at)}
              </time>
              <div className="hub-caixa-timeline__track" aria-hidden={isLast}>
                <HistoryIcon kind={item.icon_kind} tone={item.icon_tone} />
                {!isLast ? <span className="hub-caixa-timeline__line" /> : null}
              </div>
              <button
                type="button"
                className="hub-caixa-timeline__body"
                onClick={() => onSelect(item)}
              >
                <span className="hub-caixa-timeline__title">{item.title}</span>
                {item.subtitle ? (
                  <span className="hub-caixa-timeline__subtitle">{item.subtitle}</span>
                ) : null}
              </button>
              <div className={`hub-caixa-timeline__amount hub-caixa-timeline__amount--${tone}`}>
                <strong>{formatHistoryAmount(item.signed_amount, item.is_pending)}</strong>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <button
          type="button"
          className="hub-caixa-timeline__more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Ver menos histórico' : 'Ver mais histórico →'}
        </button>
      ) : null}
    </>
  );
};
