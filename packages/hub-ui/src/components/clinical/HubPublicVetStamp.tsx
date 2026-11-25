import React from 'react';
import './hub-vet-stamp.css';

export type HubPublicVetStampProps = {
  signatureUrl?: string | null;
  stampUrl?: string | null;
  className?: string;
};

export const HubPublicVetStamp: React.FC<HubPublicVetStampProps> = ({
  signatureUrl,
  stampUrl,
  className = 'hub-public-vet-stamp',
}) => {
  const sig = signatureUrl?.trim() || '';
  const stamp = stampUrl?.trim() || '';
  if (!sig && !stamp) return null;
  return (
    <div className={className}>
      {sig ? <img src={sig} alt="Assinatura" data-kind="signature" /> : null}
      {stamp ? <img src={stamp} alt="Carimbo" data-kind="stamp" /> : null}
    </div>
  );
};
