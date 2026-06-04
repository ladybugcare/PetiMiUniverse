import React, { useEffect, useRef, useState } from 'react';
import { Home, ChevronDown, Check } from 'lucide-react';
import { useHubUnit } from '../contexts/HubUnitContext';

const HubHeaderUnitSelector: React.FC = () => {
  const { clinicId, clinicName, selectedUnit, units, setSelectedUnit, loading } = useHubUnit();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasMultiple = units.length > 1;
  const unitLabel =
    selectedUnit?.name?.trim() ||
    (units.length === 1 ? units[0]?.name?.trim() : '') ||
    '—';
  const primaryLabel = clinicId ? clinicName : 'Sem clínica';
  const secondaryLabel = clinicId ? unitLabel || '—' : '—';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (loading) {
    return (
      <div className="hub-header-unit hub-header-unit--loading" aria-busy="true">
        <span className="hub-header-unit__icon-wrap" aria-hidden>
          <Home size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-header-unit__text">
          <span className="hub-header-unit__name">A carregar…</span>
        </span>
      </div>
    );
  }

  const body = (
    <>
      <span className="hub-header-unit__icon-wrap" aria-hidden>
        <Home size={18} strokeWidth={1.75} />
      </span>
      <span className="hub-header-unit__text">
        <span className="hub-header-unit__name">{primaryLabel}</span>
        <span className="hub-header-unit__sub">{secondaryLabel}</span>
      </span>
      {hasMultiple && (
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`hub-header-unit__chevron${open ? ' hub-header-unit__chevron--open' : ''}`}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <div className="hub-header-unit-wrap" ref={wrapRef}>
      {hasMultiple ? (
        <button
          type="button"
          className="hub-header-unit"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Unidade: ${primaryLabel}, ${secondaryLabel}. Escolher unidade`}
          onClick={() => setOpen((o) => !o)}
        >
          {body}
        </button>
      ) : (
        <div className="hub-header-unit hub-header-unit--static" aria-label={`Unidade: ${primaryLabel}, ${secondaryLabel}`}>
          {body}
        </div>
      )}

      {open && hasMultiple && (
        <div className="hub-header-unit__menu" role="listbox" aria-label="Unidades">
          {units.map((unit) => {
            const active = selectedUnit?.id === unit.id;
            return (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`hub-header-unit__option${active ? ' hub-header-unit__option--active' : ''}`}
                onClick={() => {
                  setSelectedUnit(unit);
                  setOpen(false);
                }}
              >
                <span className="hub-header-unit__option-text">
                  <span className="hub-header-unit__option-name">{unit.name}</span>
                  {unit.is_main && <span className="hub-header-unit__option-badge">Matriz</span>}
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

export default HubHeaderUnitSelector;
