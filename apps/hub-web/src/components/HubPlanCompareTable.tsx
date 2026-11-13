import React from 'react';
import { Check, Minus } from 'lucide-react';
import {
  HUB_COMPARE_GROUPS,
  HUB_COMPARE_PLAN_COLUMNS,
  type HubCompareCell,
} from '../constants/hubPlanCompare';

function CellMark({ value }: { value: HubCompareCell }) {
  if (value === true) {
    return (
      <span className="hub-plans-compare__yes" title="Incluso">
        <Check size={16} strokeWidth={2.5} aria-hidden />
        <span className="visually-hidden">Incluso</span>
      </span>
    );
  }
  if (value === 'note') {
    return <span className="hub-plans-compare__note">Ressalva</span>;
  }
  return (
    <span className="hub-plans-compare__no" title="Não incluso">
      <Minus size={16} strokeWidth={2.5} aria-hidden />
      <span className="visually-hidden">Não incluso</span>
    </span>
  );
}

type Props = {
  id?: string;
  title?: string;
  lead?: string;
  className?: string;
};

const DEFAULT_LEAD =
  'Recursos agrupados por área. Não prometemos gateway de cobrança ao tutor nem WhatsApp Cloud API — ainda não fazem parte do produto.';

/** Tabela comparativa dos 4 planos (6 grupos do redesenho comercial). */
const HubPlanCompareTable: React.FC<Props> = ({
  id = 'comparativo',
  title = 'Comparativo de funcionalidades',
  lead = DEFAULT_LEAD,
  className,
}) => {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={['hub-plans-compare', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      {lead ? <p className="hub-plans-compare__lead">{lead}</p> : null}
      <div className="hub-plans-compare__scroll">
        <table className="hub-plans-compare__table">
          <thead>
            <tr>
              <th scope="col">Recurso</th>
              {HUB_COMPARE_PLAN_COLUMNS.map((p) => (
                <th key={p.slug} scope="col">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HUB_COMPARE_GROUPS.map((group) => (
              <React.Fragment key={group.title}>
                <tr className="hub-plans-compare__group">
                  <th scope="rowgroup" colSpan={5}>
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      {row.label}
                      {row.note ? (
                        <span className="hub-plans-compare__footnote">{row.note}</span>
                      ) : null}
                    </th>
                    {HUB_COMPARE_PLAN_COLUMNS.map((p) => (
                      <td key={p.slug}>
                        <CellMark value={row.values[p.slug]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default HubPlanCompareTable;
