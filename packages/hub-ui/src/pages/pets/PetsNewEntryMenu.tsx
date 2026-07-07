import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Dog, Plus, Zap } from 'lucide-react';

type Props = {
  onNewPet: () => void;
  onQuickCreate: () => void;
};

export const PetsNewEntryMenu: React.FC<Props> = ({ onNewPet, onQuickCreate }) => {
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
      minWidth: Math.max(220, r.width),
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="hub-pets__new-split" ref={anchorRef}>
      <button type="button" className="hub-pets__new-split-main" onClick={onNewPet}>
        <Plus size={18} strokeWidth={2.5} aria-hidden />
        Novo pet
      </button>
      <button
        type="button"
        className="hub-pets__new-split-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mais opções de cadastro de pet"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        menuFixedStyle &&
        createPortal(
          <div ref={menuRef} className="hub-pets__new-menu" style={menuFixedStyle} role="menu">
            <button
              type="button"
              className="hub-pets__new-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNewPet();
              }}
            >
              <span className="hub-pets__new-menu-item-icon" aria-hidden>
                <Dog size={18} strokeWidth={2} />
              </span>
              <span className="hub-pets__new-menu-item-text">
                <strong>Cadastro completo</strong>
                <span className="hub-pets__new-menu-item-hint">Assistente passo a passo</span>
              </span>
            </button>
            <button
              type="button"
              className="hub-pets__new-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onQuickCreate();
              }}
            >
              <span className="hub-pets__new-menu-item-icon hub-pets__new-menu-item-icon--quick" aria-hidden>
                <Zap size={18} strokeWidth={2} />
              </span>
              <span className="hub-pets__new-menu-item-text">
                <strong>Cadastro rápido</strong>
                <span className="hub-pets__new-menu-item-hint">Formulário resumido na lateral</span>
              </span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
