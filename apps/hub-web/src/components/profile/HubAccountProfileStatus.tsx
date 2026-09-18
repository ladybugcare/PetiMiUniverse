import React from 'react';

function statusTone(status?: string | null): { label: string; tone: 'ok' | 'warn' | 'alert' | 'muted' } {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'approved') return { label: 'Ativa', tone: 'ok' };
  if (s === 'pending_review' || s === 'pending_approval') return { label: 'Pendente', tone: 'warn' };
  if (s === 'suspended' || s === 'rejected' || s === 'inactive') return { label: 'Inativa', tone: 'alert' };
  return { label: status?.trim() || '—', tone: 'muted' };
}

type Props = {
  status?: string | null;
};

const HubAccountProfileStatus: React.FC<Props> = ({ status }) => {
  const { label, tone } = statusTone(status);
  return <span className={`hub-ap__badge hub-ap__badge--${tone}`}>{label}</span>;
};

export default HubAccountProfileStatus;
