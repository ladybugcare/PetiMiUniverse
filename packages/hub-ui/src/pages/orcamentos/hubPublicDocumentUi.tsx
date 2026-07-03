import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Dog } from 'lucide-react';

export function PublicDocHeaderLogo({
  logoUrl,
  clinicName,
}: {
  logoUrl?: string | null;
  clinicName?: string | null;
}) {
  const alt = clinicName?.trim() ? `Logo de ${clinicName.trim()}` : 'Logo da clínica';
  if (logoUrl?.trim()) {
    return (
      <span className="hub-public-quote__header-logo hub-public-quote__header-logo--img">
        <img src={logoUrl.trim()} alt={alt} className="hub-public-quote__header-logo-image" />
      </span>
    );
  }
  return (
    <span className="hub-public-quote__header-logo" aria-hidden>
      <Dog size={28} strokeWidth={2} />
    </span>
  );
}

export function PublicDocCardTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="hub-public-quote__card-title hub-public-quote__card-title--with-ic">
      <Icon size={18} strokeWidth={2} className="hub-public-quote__ic" aria-hidden />
      {children}
    </h2>
  );
}

export function PublicDocMetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hub-public-quote__meta-row">
      <Icon size={16} strokeWidth={2} className="hub-public-quote__ic" aria-hidden />
      <div className="hub-public-quote__meta-row-body">
        <p className="hub-public-quote__meta-label">{label}</p>
        <div className="hub-public-quote__meta-value-wrap">{children}</div>
      </div>
    </div>
  );
}

export function PublicDocFieldLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <dt>
      <Icon size={14} strokeWidth={2} className="hub-public-quote__ic" aria-hidden />
      {children}
    </dt>
  );
}
