import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MessageCircle, MoreHorizontal, PlusCircle, Package } from 'lucide-react';
import { buildWhatsappLink } from '../../utils/whatsappLink';

type Props = {
  guardianId: string;
  phone: string | null;
  email: string | null;
  onArchive?: () => void;
  /** Abre a venda de pacote já com este tutor. */
  onSellPackage?: () => void;
  canSellPackage?: boolean;
};

/** Ações rápidas com ícone + rótulo (mesmo padrão do perfil do pet). */
export const GuardianDetailQuickActions: React.FC<Props> = ({
  guardianId,
  phone,
  email,
  onArchive,
  onSellPackage,
  canSellPackage = false,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const petsUrl = `/hub/pets/novo?guardianId=${encodeURIComponent(guardianId)}&returnTo=${encodeURIComponent(`/hub/clientes/${guardianId}?tab=pets`)}`;
  const waHref = buildWhatsappLink(phone, '');

  return (
    <div className="hub-client-profile__quick-actions" role="toolbar" aria-label="Ações rápidas">
      <a
        className={`hub-client-profile__quick-item${!waHref ? ' hub-client-profile__quick-item--disabled' : ''}`}
        href={waHref ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        onClick={(e) => {
          if (!waHref) e.preventDefault();
        }}
        aria-disabled={!waHref}
      >
        <span className="hub-clientes__icon-btn" aria-hidden>
          <MessageCircle size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-client-profile__quick-label">WhatsApp</span>
      </a>
      <a
        className={`hub-client-profile__quick-item${!phone ? ' hub-client-profile__quick-item--disabled' : ''}`}
        href={phone ? `tel:${phone}` : '#'}
        title="Ligar"
        onClick={(e) => {
          if (!phone) e.preventDefault();
        }}
      >
        <span className="hub-clientes__icon-btn" aria-hidden>
          <Phone size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-client-profile__quick-label">Ligar</span>
      </a>
      <a
        className={`hub-client-profile__quick-item${!email ? ' hub-client-profile__quick-item--disabled' : ''}`}
        href={email ? `mailto:${email}` : '#'}
        title="E-mail"
        onClick={(e) => {
          if (!email) e.preventDefault();
        }}
      >
        <span className="hub-clientes__icon-btn" aria-hidden>
          <Mail size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-client-profile__quick-label">E-mail</span>
      </a>
      <Link
        to={petsUrl}
        className="hub-client-profile__quick-item"
        title="Cadastrar pet com este tutor"
      >
        <span className="hub-clientes__icon-btn hub-clientes__icon-btn--accent" aria-hidden>
          <PlusCircle size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-client-profile__quick-label">Pet</span>
      </Link>
      {canSellPackage && onSellPackage ? (
        <button
          type="button"
          className="hub-client-profile__quick-item"
          title="Vender pacote"
          onClick={onSellPackage}
        >
          <span className="hub-clientes__icon-btn" aria-hidden>
            <Package size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-client-profile__quick-label">Pacote</span>
        </button>
      ) : null}
      {onArchive ? (
        <div className="hub-client-profile__quick-item hub-clientes__dropdown-wrap" ref={wrapRef}>
          <button
            type="button"
            className="hub-client-profile__quick-stack"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Mais opções"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="hub-clientes__icon-btn" aria-hidden>
              <MoreHorizontal size={18} strokeWidth={1.75} />
            </span>
            <span className="hub-client-profile__quick-label">Mais</span>
          </button>
          {open ? (
            <div className="hub-clientes__dropdown-menu" role="menu">
              <button
                type="button"
                className="hub-clientes__dropdown-item hub-clientes__dropdown-item--danger"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onArchive();
                }}
              >
                Arquivar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
