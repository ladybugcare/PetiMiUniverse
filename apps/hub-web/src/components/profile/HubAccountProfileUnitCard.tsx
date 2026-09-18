import React from 'react';
import { MapPin, Pencil, Phone, Store, User } from 'lucide-react';
import HubAccountProfileStatus from './HubAccountProfileStatus';

type Props = {
  name: string;
  nickname?: string | null;
  addressLine: string;
  phone: string;
  technicalManager: string;
  isMain?: boolean | null;
  status?: string | null;
  canEdit?: boolean;
  onEdit?: () => void;
};

const HubAccountProfileUnitCard: React.FC<Props> = ({
  name,
  nickname,
  addressLine,
  phone,
  technicalManager,
  isMain,
  status,
  canEdit,
  onEdit,
}) => (
  <article className="hub-ap__unit">
    <div className="hub-ap__unit-top">
      <div className="hub-ap__unit-heading">
        <span className="hub-ap__unit-icon" aria-hidden>
          <Store size={18} strokeWidth={1.75} />
        </span>
        <div className="hub-ap__unit-titles">
          <h3 className="hub-ap__unit-name">{name}</h3>
          {nickname?.trim() ? <p className="hub-ap__unit-nick">Agenda: {nickname.trim()}</p> : null}
        </div>
      </div>
      <div className="hub-ap__unit-flags">
        {isMain ? <span className="hub-ap__badge">Matriz</span> : null}
        <HubAccountProfileStatus status={status} />
      </div>
    </div>
    <dl className="hub-ap__unit-dl">
      <div className="hub-ap__unit-row">
        <MapPin size={15} strokeWidth={1.75} aria-hidden />
        <span>{addressLine}</span>
      </div>
      <div className="hub-ap__unit-row">
        <Phone size={15} strokeWidth={1.75} aria-hidden />
        <span>{phone}</span>
      </div>
      <div className="hub-ap__unit-row">
        <User size={15} strokeWidth={1.75} aria-hidden />
        <span>{technicalManager}</span>
      </div>
    </dl>
    {canEdit && onEdit ? (
      <div className="hub-ap__unit-foot">
        <button type="button" className="hub-ap__btn hub-ap__btn--ghost" onClick={onEdit}>
          <Pencil size={15} aria-hidden />
          Editar
        </button>
      </div>
    ) : null}
  </article>
);

export default HubAccountProfileUnitCard;
