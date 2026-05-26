import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

type Props = {
  onEdit: () => void;
  onArchive: () => void;
};

/**
 * Menu ⋮ com Editar + Arquivar; portal + fixed para não ser cortado pelo overflow da tabela.
 */
export const PetTableActions: React.FC<Props> = ({ onEdit, onArchive }) => {
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
      zIndex: 10000,
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

  return (
    <div className="hub-clientes__dropdown-wrap" ref={anchorRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost"
        style={{ padding: 6, minWidth: 0 }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Ações do pet"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={18} />
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
              className="hub-clientes__dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Editar
            </button>
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
  );
};
