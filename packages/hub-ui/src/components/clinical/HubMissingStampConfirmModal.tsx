import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HubModal } from '../HubModal';

export type HubMissingStampConfirmModalProps = {
  open: boolean;
  missingSignature: boolean;
  missingStamp: boolean;
  veterinarianName?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** Destino do CTA “Cadastrar agora”. Default: Meu perfil. */
  registerPath?: string;
};

function missingLabel(missingSignature: boolean, missingStamp: boolean): string {
  if (missingSignature && missingStamp) return 'assinatura e carimbo';
  if (missingSignature) return 'assinatura';
  return 'carimbo';
}

export const HubMissingStampConfirmModal: React.FC<HubMissingStampConfirmModalProps> = ({
  open,
  missingSignature,
  missingStamp,
  veterinarianName,
  onCancel,
  onConfirm,
  registerPath = '/hub/meu-perfil',
}) => {
  const navigate = useNavigate();
  const what = missingLabel(missingSignature, missingStamp);
  const who = veterinarianName?.trim() || 'o veterinário responsável';

  return (
    <HubModal
      open={open}
      onClose={onCancel}
      title="Assinatura ou carimbo ausente"
      size="lg"
      footer={
        <>
          <button type="button" className="hub-clientes__btn" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn"
            onClick={() => {
              onCancel();
              navigate(registerPath);
            }}
          >
            Cadastrar agora
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onConfirm}>
            Emitir mesmo assim
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.45 }}>
        {who} ainda não tem {what} cadastrado(s). O documento será emitido só com nome e CRMV.
      </p>
      <p className="hub-clientes__muted" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.4 }}>
        Cadastre a foto da assinatura e do carimbo em Meu perfil (ou na Equipe) para aparecerem
        automaticamente nas próximas emissões.
      </p>
    </HubModal>
  );
};

export function resolveMissingStampFlags(staff: {
  signature_image_url?: string | null;
  stamp_image_url?: string | null;
} | null | undefined): { missingSignature: boolean; missingStamp: boolean; missingAny: boolean } {
  const missingSignature = !staff?.signature_image_url?.trim();
  const missingStamp = !staff?.stamp_image_url?.trim();
  return { missingSignature, missingStamp, missingAny: missingSignature || missingStamp };
}
