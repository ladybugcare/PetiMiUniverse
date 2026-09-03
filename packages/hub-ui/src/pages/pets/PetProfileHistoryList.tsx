import React from 'react';
import type { HubPetProfileChange } from '../../api/hubPetsApi';
import { formatPetProfileChangeLine } from './formatPetProfileChange';

type Props = {
  changes: HubPetProfileChange[];
  emptyLabel?: string;
};

export const PetProfileHistoryList: React.FC<Props> = ({
  changes,
  emptyLabel = 'Ainda não há alterações registradas nesta ficha.',
}) => {
  if (changes.length === 0) {
    return <p className="hub-clientes__muted" style={{ margin: 0 }}>{emptyLabel}</p>;
  }
  return (
    <ul className="hub-pet-profile-history">
      {changes.map((c) => (
        <li key={c.id}>{formatPetProfileChangeLine(c)}</li>
      ))}
    </ul>
  );
};
