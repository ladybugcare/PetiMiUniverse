import React, { useEffect, useState } from 'react';
import { HubModal } from '../HubModal';
import type { HubPrescriptionDocumentRow } from '../../api/hubClinicalApi';

type Props = {
  open: boolean;
  onClose: () => void;
  document: HubPrescriptionDocumentRow | null;
  onConfirm: (reason: string) => Promise<void>;
  submitting?: boolean;
};

export function HubPrescriptionRevokeModal({ open, onClose, document, onConfirm, submitting }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 10 && trimmed.length <= 500;

  return (
    <HubModal
      open={open}
      onClose={onClose}
      title="Revogar receita validável"
      subtitle={
        document
          ? `Versão ${document.version_no}${document.validation_code ? ` · ${document.validation_code}` : ''}`
          : undefined
      }
      footer={
        <>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" disabled={submitting} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--danger hub-clientes__btn--sm"
            disabled={!canSubmit || submitting}
            onClick={() => void onConfirm(trimmed)}
          >
            {submitting ? 'Revogando…' : 'Confirmar revogação'}
          </button>
        </>
      }
    >
      <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
        A receita deixará de constar como válida na consulta pública. Informe o motivo (mínimo 10 caracteres).
      </p>
      <textarea
        className="hub-clientes__input"
        rows={4}
        value={reason}
        disabled={submitting}
        placeholder="Ex.: erro de posologia identificado após emissão"
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="hub-clientes__muted" style={{ fontSize: 12, marginBottom: 0 }}>
        {trimmed.length}/500 caracteres
      </p>
    </HubModal>
  );
}
