import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MoreVertical, PlusCircle } from 'lucide-react';

type Props = {
  guardianId: string;
  /** Quando definido, mostra o menu de overflow com Arquivar */
  onArchive?: () => void;
  /** true = estilo da linha da tabela (botões compactos) */
  compact?: boolean;
};

/**
 * Adicionar pet (link para /hub/pets/novo com tutor pré-selecionado) + menu "…" com Arquivar.
 */
export const AddPetAndOverflowMenu: React.FC<Props> = ({ guardianId, onArchive, compact }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuFixedStyle, setMenuFixedStyle] = useState<React.CSSProperties | null>(null);

  const updateMenuPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setMenuFixedStyle({
      position: 'fixed',
      top: r.bottom + 4,
      right: window.innerWidth - r.right,
      left: 'auto',
      zIndex: 10_000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuFixedStyle(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const petsUrl = `/hub/pets/novo?guardianId=${encodeURIComponent(guardianId)}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 10,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Link
        to={petsUrl}
        className={`hub-clientes__icon-btn ${compact ? '' : 'hub-clientes__icon-btn--accent'}`}
        title="Cadastrar pet com este tutor"
        aria-label="Adicionar pet"
      >
        <PlusCircle size={compact ? 16 : 18} />
      </Link>
      {onArchive && (
        <div className="hub-clientes__dropdown-wrap" ref={anchorRef}>
          <button
            type="button"
            className={compact ? 'hub-clientes__btn hub-clientes__btn--ghost' : 'hub-clientes__icon-btn'}
            style={compact ? { padding: 6, minWidth: 0 } : undefined}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Mais opções"
            onClick={() => setOpen((o) => !o)}
          >
            <MoreVertical size={compact ? 18 : 18} />
          </button>
          {open &&
            typeof document !== 'undefined' &&
            menuFixedStyle &&
            createPortal(
              <div
                ref={menuRef}
                className="hub-clientes__dropdown-menu hub-clientes__dropdown-menu--portal"
                style={menuFixedStyle}
                role="menu"
              >
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
              </div>,
              document.body
            )}
        </div>
      )}
    </div>
  );
};
