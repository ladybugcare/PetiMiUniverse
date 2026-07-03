import React from 'react';
import { Mail, MessageCircle, Phone } from 'lucide-react';

export type DocumentContactStripProps = {
  name: string;
  phone?: string | null;
  email?: string | null;
  telHref?: string | null;
  waHref?: string | null;
  leading?: React.ReactNode;
  extraLines?: React.ReactNode;
};

export function DocumentContactStrip({
  name,
  phone,
  email,
  telHref,
  waHref,
  leading,
  extraLines,
}: DocumentContactStripProps) {
  return (
    <div className="hub-doc-party">
      {leading}
      <div className="hub-doc-party__contact-row">
        <div className="hub-doc-party__contact-main">
          <p className="hub-doc-party__contact-name">{name}</p>
          <p className="hub-doc-party__contact-meta">
            <Mail size={15} strokeWidth={2} aria-hidden />
            {email ? (
              <a href={`mailto:${email}`} className="hub-doc-party__meta-text hub-doc-party__meta-link">
                {email}
              </a>
            ) : (
              <span className="hub-doc-party__meta-muted">—</span>
            )}
          </p>
          {extraLines}
        </div>
        <div className="hub-doc-party__contact-phone">
          <span className="hub-doc-party__col-label">Telefone</span>
          <span className="hub-doc-party__phone-row">
            <Phone size={15} strokeWidth={2} className="hub-doc-party__phone-ic" aria-hidden />
            {telHref && phone ? (
              <a href={telHref} className="hub-doc-party__phone-link">
                {phone}
              </a>
            ) : (
              <span className="hub-doc-party__phone-link">{phone?.trim() || '—'}</span>
            )}
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hub-quote-detail__ic-link"
                title="WhatsApp"
              >
                <MessageCircle size={18} />
              </a>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

export type DocumentPetStripProps = {
  name: React.ReactNode;
  species: string;
  breed: string;
  sizeTier: string;
  sex: string;
};

export function DocumentPetStrip({ name, species, breed, sizeTier, sex }: DocumentPetStripProps) {
  const cols = [
    { label: 'Nome', value: name, accent: true },
    { label: 'Espécie', value: species },
    { label: 'Raça', value: breed },
    { label: 'Porte', value: sizeTier },
    { label: 'Sexo', value: sex },
  ];

  return (
    <div className="hub-doc-party__pet-strip">
      {cols.map((col, idx) => (
        <div
          key={col.label}
          className={`hub-doc-party__pet-col${col.accent ? ' hub-doc-party__pet-col--accent' : ''}${idx < cols.length - 1 ? ' hub-doc-party__pet-col--divider' : ''}`}
        >
          <span className="hub-doc-party__col-label">{col.label}</span>
          <span className="hub-doc-party__col-value">{col.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DocumentPetStripList({ children }: { children: React.ReactNode }) {
  return <div className="hub-doc-party__pet-list">{children}</div>;
}
