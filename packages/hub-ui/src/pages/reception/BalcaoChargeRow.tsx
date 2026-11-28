import React from 'react';
import { chargeCtaLabel, type BalcaoChargeItem } from './balcaoBoard';
import { formatBrl } from './balcaoUi';

export type BalcaoChargeRowProps = {
  row: BalcaoChargeItem;
  busy: boolean;
  canCreateReceivable: boolean;
  compactTutor?: boolean;
  onOpen: (row: BalcaoChargeItem) => void;
};

const BalcaoChargeRow: React.FC<BalcaoChargeRowProps> = ({
  row,
  busy,
  canCreateReceivable,
  compactTutor = false,
  onOpen,
}) => {
  const amountLabel = formatBrl(row.amount);
  const tutor = row.guardian_name || 'Sem tutor';
  const kindLabel =
    row.kind === 'sem_comanda' ? 'Sem comanda' : row.kind === 'comanda_aberta' ? 'Comanda aberta' : 'A receber';

  return (
    <li className="hub-balcao-row hub-balcao-row--charge">
      <div className="hub-balcao-row__identity">
        <p className="hub-balcao-row__pet" title={row.pet_name}>
          {row.pet_name}
        </p>
        {!compactTutor ? (
          <p className="hub-balcao-row__tutor" title={tutor}>
            {tutor}
          </p>
        ) : null}
      </div>

      <div className="hub-balcao-row__status">
        {amountLabel ? <span className="hub-balcao-row__amount">{amountLabel}</span> : null}
        <span className="hub-clientes__pill hub-clinic-queue__pill--waiting">{kindLabel}</span>
      </div>

      <p className="hub-balcao-row__meta" title={row.label}>
        {row.label}
      </p>

      <div className="hub-balcao-row__actions">
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
          disabled={busy || !canCreateReceivable}
          onClick={() => onOpen(row)}
        >
          {busy ? 'Abrindo…' : chargeCtaLabel(row.kind)}
        </button>
      </div>
    </li>
  );
};

export default BalcaoChargeRow;
