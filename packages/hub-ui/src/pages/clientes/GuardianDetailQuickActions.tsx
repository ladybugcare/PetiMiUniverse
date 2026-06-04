import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MessageCircle, MoreHorizontal, PlusCircle } from 'lucide-react';

type Props = {
  guardianId: string;
  phone: string | null;
  email: string | null;
  onArchive?: () => void;
};

/** Linha de contato rápido + adicionar pet + menu com Arquivar (painel de detalhe). */
export const GuardianDetailQuickActions: React.FC<Props> = ({ guardianId, phone, email, onArchive }) => {
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

  const petsUrl = `/hub/pets/novo?guardianId=${encodeURIComponent(guardianId)}`;

  return (
    <div className="hub-clientes__quick-actions">
      <a
        className="hub-clientes__icon-btn"
        href={phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '#'}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        onClick={(e) => {
          if (!phone) e.preventDefault();
        }}
        aria-disabled={!phone}
      >
        <MessageCircle size={18} />
      </a>
      <a
        className="hub-clientes__icon-btn"
        href={phone ? `tel:${phone}` : '#'}
        onClick={(e) => {
          if (!phone) e.preventDefault();
        }}
        title="Ligar"
      >
        <Phone size={18} />
      </a>
      <a
        className="hub-clientes__icon-btn"
        href={email ? `mailto:${email}` : '#'}
        onClick={(e) => {
          if (!email) e.preventDefault();
        }}
        title="E-mail"
      >
        <Mail size={18} />
      </a>
      <Link
        to={petsUrl}
        className="hub-clientes__icon-btn hub-clientes__icon-btn--accent"
        title="Cadastrar pet com este tutor"
        aria-label="Adicionar pet"
      >
        <PlusCircle size={18} />
      </Link>
      {onArchive && (
        <div className="hub-clientes__dropdown-wrap" ref={wrapRef}>
          <button
            type="button"
            className="hub-clientes__icon-btn"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Mais opções"
            onClick={() => setOpen((o) => !o)}
          >
            <MoreHorizontal size={18} />
          </button>
          {open && (
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
          )}
        </div>
      )}
    </div>
  );
};
