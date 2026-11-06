import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Home } from 'lucide-react';
import { useUnit } from '../contexts/UnitContext';

type UnitSelectorProps = {
  collapsed?: boolean;
};

const UnitSelector: React.FC<UnitSelectorProps> = ({ collapsed = false }) => {
  const { selectedUnit, units, setSelectedUnit, loading } = useUnit();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasMultiple = units.length > 1;
  const unit = selectedUnit;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (loading || !unit) return null;

  const subtitle = unit.is_main ? 'Matriz' : unit.city || 'Unidade';

  const body = (
    <>
      <span className="shift-unit__icon" aria-hidden>
        <Home size={18} strokeWidth={1.75} />
      </span>
      <span className="shift-unit__text">
        <span className="shift-unit__name">{unit.name}</span>
        <span className="shift-unit__sub">{subtitle}</span>
      </span>
      {hasMultiple && (
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`shift-unit__chevron${open ? ' shift-unit__chevron--open' : ''}`}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <div className="shift-unit" ref={wrapRef}>
      {hasMultiple ? (
        <button
          type="button"
          className="shift-unit__trigger"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Unidade: ${unit.name}. Escolher unidade`}
          title={collapsed ? unit.name : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {body}
        </button>
      ) : (
        <div className="shift-unit__trigger shift-unit__trigger--static" aria-label={`Unidade: ${unit.name}`}>
          {body}
        </div>
      )}

      {open && hasMultiple && (
        <div className="shift-unit__menu" role="listbox" aria-label="Unidades">
          {units.map((option) => {
            const active = option.id === unit.id;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                className={['shift-unit__option', active ? 'shift-unit__option--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setSelectedUnit(option);
                  setOpen(false);
                }}
              >
                <span className="shift-unit__option-name">
                  {option.is_main ? 'Matriz · ' : ''}
                  {option.name}
                </span>
                {active && <Check size={16} strokeWidth={2.25} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UnitSelector;
