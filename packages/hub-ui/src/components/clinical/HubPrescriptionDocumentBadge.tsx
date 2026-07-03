import React from 'react';
import type { HubPrescriptionDocumentStatus } from '../../api/hubClinicalApi';

const LABELS: Record<HubPrescriptionDocumentStatus, string> = {
  valid: 'Válida',
  revoked: 'Revogada',
  expired: 'Expirada',
};

const CLASS: Record<HubPrescriptionDocumentStatus, string> = {
  valid: 'hub-rx-badge--valid',
  revoked: 'hub-rx-badge--revoked',
  expired: 'hub-rx-badge--expired',
};

export function HubPrescriptionDocumentBadge({
  status,
}: {
  status: HubPrescriptionDocumentStatus | undefined | null;
}) {
  if (!status) return null;
  return <span className={`hub-rx-badge ${CLASS[status]}`}>{LABELS[status]}</span>;
}
