import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import './HubSearchableCombobox.css';

export type HubComboboxOption = {
  value: string;
  label: string;
  icon?: React.ReactNode;
};

export type HubSearchableComboboxProps = {
  id: string;
  className?: string;
  /** Opções (sem entrada vazia fictícia — valor vazio = nada selecionado). */
  options: HubComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Permite criar valor a partir do texto de pesquisa (ex.: espécie ou raça livre). */
  allowCreate?: boolean;
  /** Substantivo para a linha «Adicionar … como nova …» (ex.: «espécie», «raça»). */
  createEntityLabel?: string;
  emptyResultsLabel?: string;
  /** Ícone à esquerda no fechado quando não há valor (ex.: pata). */
  triggerIcon?: React.ReactNode;
  /** aria-label do botão trigger */
  ariaLabel?: string;
  /** Mostrar «limpar» no trigger (desligar para campos obrigatórios sem opção vazia). */
  clearable?: boolean;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

type FloatingRect = { top: number; left: number; width: number; maxHeight: number };

export const HubSearchableCombobox: React.FC<HubSearchableComboboxProps> = ({
  id,
  className = '',
  options,
  value,
  onChange,
  placeholder = 'Selecionar…',
  searchPlaceholder = 'Buscar…',
  disabled = false,
  allowCreate = false,
  createEntityLabel = 'opção',
  emptyResultsLabel = 'Nenhum resultado encontrado',
  triggerIcon,
  ariaLabel,
  clearable = true,
}) => {
  const uid = useId();
  const listId = `${id}-list-${uid}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [floating, setFloating] = useState<FloatingRect | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q) || norm(o.value).includes(q));
  }, [options, query]);

  const qTrim = query.trim();
  const showCreate =
    allowCreate &&
    !!qTrim &&
    !options.some((o) => norm(o.label) === norm(qTrim) || norm(o.value) === norm(qTrim));

  const updateFloating = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const margin = 8;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const width = Math.max(rect.width, 200);
    let left = rect.left;
    if (left + width > vw - margin) {
      left = Math.max(margin, vw - margin - width);
    }
    if (left < margin) left = margin;
    const gap = 4;
    const top = rect.bottom + gap;
    const maxHeight = Math.min(360, Math.max(140, vh - top - margin));
    setFloating({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setFloating(null);
      return;
    }
    updateFloating();
    const onWin = () => updateFloating();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, updateFloating]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commit = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const onCreate = () => {
    if (!qTrim) return;
    commit(qTrim);
  };

  const onClearTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  const showLeading = !!(selected?.icon || (!value && triggerIcon));
  const showClear = clearable && !!value && !disabled;

  const panelBody = open && floating && (
    <div
      ref={panelRef}
      id={listId}
      className="hub-combobox__panel hub-combobox__panel--portal"
      role="listbox"
      aria-labelledby={id}
      style={{
        position: 'fixed',
        top: floating.top,
        left: floating.left,
        width: floating.width,
        maxHeight: floating.maxHeight,
        zIndex: 11000,
      }}
    >
      <div className="hub-combobox__search-wrap">
        <Search className="hub-combobox__search-icon" size={16} strokeWidth={2} aria-hidden />
        <input
          ref={searchRef}
          type="text"
          className="hub-combobox__search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
          aria-label={searchPlaceholder}
        />
        {query ? (
          <button type="button" className="hub-combobox__search-clear" onClick={() => setQuery('')} aria-label="Limpar pesquisa">
            <X size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <ul className="hub-combobox__list" role="presentation">
        {filtered.length === 0 ? (
          <li className="hub-combobox__empty" role="presentation">
            <Search size={20} strokeWidth={1.5} aria-hidden />
            <span>{emptyResultsLabel}</span>
          </li>
        ) : (
          filtered.map((o) => {
            const isSel = o.value === value;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={`hub-combobox__option ${isSel ? 'hub-combobox__option--selected' : ''} ${o.icon ? '' : 'hub-combobox__option--no-icon'}`.trim()}
                  onClick={() => commit(o.value)}
                >
                  <span className="hub-combobox__option-icon" aria-hidden>
                    {o.icon}
                  </span>
                  <span className="hub-combobox__option-label">{o.label}</span>
                  {isSel ? (
                    <span className="hub-combobox__option-check" aria-hidden>
                      <Check size={18} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {showCreate ? (
        <div className="hub-combobox__create">
          <button type="button" className="hub-combobox__create-btn" onClick={onCreate}>
            + Adicionar &apos;{qTrim}&apos; como nova {createEntityLabel}
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`hub-combobox ${disabled ? 'hub-combobox--disabled' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        id={id}
        className={`hub-combobox__trigger ${showLeading ? '' : 'hub-combobox__trigger--no-leading'}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={`hub-combobox__trigger-leading ${showLeading ? '' : 'hub-combobox__trigger-leading--hidden'}`} aria-hidden>
          {selected?.icon ?? (!value ? triggerIcon : null)}
        </span>
        <span className={`hub-combobox__trigger-label ${!value ? 'hub-combobox__trigger-label--placeholder' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="hub-combobox__trigger-actions">
          {showClear ? (
            <span
              role="button"
              tabIndex={0}
              className="hub-combobox__clear"
              onClick={onClearTrigger}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClearTrigger(e as unknown as React.MouseEvent);
                }
              }}
              aria-label="Limpar seleção"
            >
              <X size={16} strokeWidth={2} />
            </span>
          ) : null}
          {open ? <ChevronUp size={18} strokeWidth={2} /> : <ChevronDown size={18} strokeWidth={2} />}
        </span>
      </button>

      {panelBody ? createPortal(panelBody, document.body) : null}
    </div>
  );
};
